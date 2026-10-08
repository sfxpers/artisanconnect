import * as z from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { accountIdOf, visitor, type AccountActor, type Actor } from "../actor";
import { tryWithin } from "../rate-limits";
import { recordSighting, type Seen } from "../signals";
import { ok, refuse } from "../result";
import { adminActorFor } from "../admins/identity";
import { alreadyChecked, isAlreadyDecided } from "../content/held";
import { causedBy } from "../errors";
import { accounts, authUsers, namesSent } from "../schema";
import { defineSection } from "../section";
import { authErrorCode, createAuth, type Auth } from "./auth";
import {
  codeRefusal,
  hasLiveSignUpCode,
  identityByEmail,
  LIMITS,
  mayEnterCode,
  mayRequestCode,
  sessionHeaders,
  slowDown,
  type From,
} from "./codes";
import {
  acceptance,
  code,
  EMAIL_CODE,
  email,
  firstProblem,
  names,
  password,
  signUpDetails,
  vatNumber,
  type SignUpDetails,
} from "./inputs";
import { publicName, shownName } from "./names";
import {
  checkNames,
  heldNames,
  heldNamesOf,
  holdNames,
  namesStanding,
  raiseHeldNames,
  raiseNames,
  showNames,
  withdrawNames,
} from "./names-check";
import { currentRules } from "./rules";
import { heldRefusal, isAddressTaken, takeAddress, toldOldAddress } from "./email-change";
import { emailTells } from "../tells";
import { verificationSettingsOf } from "../verification";
import { closeAccount, closedRefusal, closedState } from "./closing";
import { standingOf } from "../standing";

export const accountsSection = defineSection({
  name: "accounts",
  queueItems: [heldNames],
  api: (ctx) => {
    let auth: Auth | undefined;
    const getAuth = () => (auth ??= createAuth(ctx));

    /** The Account an identity is, while it is open: a Closed one acts for nobody. */
    async function actorFor(identityId: string): Promise<AccountActor | null> {
      const [account] = await ctx.db
        .select({ id: accounts.id, kind: accounts.kind })
        .from(accounts)
        .where(and(eq(accounts.id, identityId), isNull(accounts.closedAt)));
      return account ? { kind: account.kind, accountId: account.id } : null;
    }

    /**
     * The session the cookie carries, if it is the signed-in Account's, with
     * the headers that carry it to better-auth and the Account's Email.
     */
    async function sessionOf(actor: Actor, cookie: string | null) {
      const accountId = accountIdOf(actor);
      if (!accountId || !cookie) return null;
      const headers = new Headers({ cookie });
      const session = await getAuth().api.getSession({ headers });
      if (session?.user.id !== accountId) return null;
      return { headers, email: session.user.email };
    }

    return {
      /**
       * A person signs up as a Client or an Artisan. The kind is fixed from
       * here on. An Email code goes to the Email; until it is proven this is a
       * sign-up, not an Account, and once its code stops working another
       * sign-up with the Email replaces it. An Email already held is refused
       * by email, with the same answer on screen as a free one.
       */
      async signUp(actor: Actor, input: SignUpDetails & From) {
        if (actor.kind !== "visitor") {
          return refuse("signed-in", "Sign out before signing up for another Account.");
        }
        const parsed = signUpDetails.safeParse(input);
        if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
        const details = parsed.data;

        const tried = await tryWithin(ctx, [{ key: `sign-up:${input.ip}`, ...LIMITS.signUpPerIp }]);
        if (!tried.ok) return slowDown(tried.waitSeconds);

        const rules = await currentRules(ctx);
        if (details.rulesVersion !== rules.version) {
          return refuse(
            "rules-changed",
            "The Marketplace rules have changed. Read and accept the current version.",
          );
        }

        const held = await identityByEmail(ctx, details.email);
        const heldByAnyone = held?.emailVerified || held?.role === "admin";
        if (held && !heldByAnyone && (await hasLiveSignUpCode(ctx, details.email))) {
          return refuse(
            "sign-up-waiting",
            `A sign-up with this Email is waiting for its code. Enter that code, or try again once it stops working, ${EMAIL_CODE.minutes} minutes after it was sent.`,
          );
        }
        // Names are checked like everything sent; a sure hit leaves the form as it was.
        const given = { name: details.name, tradingName: details.tradingName ?? null };
        const checked = await checkNames(ctx, given);
        if (!checked.ok) return checked;
        const refused = await mayRequestCode(ctx, details.email, input.ip);
        if (refused) return refused;

        if (heldByAnyone) {
          // Refused, but the answer on screen is the same as for a free Email,
          // so nobody can probe who holds one; the Email is told instead.
          await hashPassword(details.password);
          await ctx.ports.mailer.send({
            to: details.email,
            subject: "Someone tried to sign up with your Email",
            text: [
              "Someone tried to sign up for ArtisanConnect with this Email. It already holds an Account, so no new one was made.",
              `If it was you, sign in: ${new URL("/sign-in", ctx.config.appUrl).href}`,
              `Forgot your password? ${new URL("/recover", ctx.config.appUrl).href}`,
              "If it was not you, you can ignore this email.",
            ].join("\n\n"),
          });
          return ok({ email: details.email });
        }

        // Nobody has proven this Email, so nobody holds it yet, and its code
        // has stopped working. better-auth writes the identity itself, so this
        // is not one batch: a sign-up left half made is unproven, and the next
        // sign-up with the Email replaces it.
        if (held) await ctx.db.delete(authUsers).where(eq(authUsers.id, held.id));

        const created = await getAuth().api.signUpEmail({
          body: { email: details.email, password: details.password, name: details.name },
        });
        const now = ctx.now();
        const verdict = checked.value;
        const clear = verdict.verdict === "clear";
        await ctx.commit([
          ctx.db.insert(accounts).values({
            id: created.user.id,
            kind: details.kind,
            name: details.name,
            tradingName: details.tradingName ?? null,
            rulesVersion: rules.version,
            rulesAcceptedAt: now,
            signedUpAt: now,
            namesShown: clear,
          }),
          // Held names reach the Admin once the Email is proven.
          verdict.verdict === "clear"
            ? ctx.db.insert(namesSent).values({
                id: ctx.newId(),
                accountId: created.user.id,
                ...given,
                state: "shown",
                sentAt: now,
              })
            : holdNames(ctx, created.user.id, given, verdict.reason).write,
        ]);
        await getAuth().api.sendVerificationOTP({
          body: { email: details.email, type: "email-verification" },
        });
        return ok({ email: details.email });
      },

      /**
       * A new Email code for a sign-up, after 60 seconds; the old one stops
       * working. The answer is the same whether or not the Email is signing up.
       */
      async resendCode(actor: Actor, input: { email: string } & From) {
        if (actor.kind !== "visitor") {
          return refuse("signed-in", "Sign out before signing up for another Account.");
        }
        const address = email.safeParse(input.email);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        const refused = await mayRequestCode(ctx, address.data, input.ip);
        if (refused) return refused;

        const identity = await identityByEmail(ctx, address.data);
        if (identity && !identity.emailVerified && (await actorFor(identity.id))) {
          await getAuth().api.sendVerificationOTP({
            body: { email: address.data, type: "email-verification" },
          });
        }
        return ok({ email: address.data });
      },

      /**
       * Proves the Email with its Email code, which makes the Account and
       * signs it in. The device and IP are recorded, as at every sign-in (#140).
       */
      async confirmEmail(actor: Actor, input: { email: string; code: string } & From & Seen) {
        if (actor.kind !== "visitor") {
          return refuse("signed-in", "Sign out before signing up for another Account.");
        }
        const address = email.safeParse(input.email);
        const given = code.safeParse(input.code);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        if (!given.success) return refuse("invalid", firstProblem(given.error));

        const tooMany = await mayEnterCode(ctx, input.ip);
        if (tooMany) return tooMany;

        let verified;
        try {
          verified = await getAuth().api.verifyEmailOTP({
            body: { email: address.data, otp: given.data },
            returnHeaders: true,
          });
        } catch (error) {
          return codeRefusal(authErrorCode(error));
        }
        const signedOut = () =>
          getAuth().api.signOut({ headers: sessionHeaders(verified.headers) });
        const [account] = await ctx.db
          .select({ id: accounts.id, kind: accounts.kind, rulesVersion: accounts.rulesVersion })
          .from(accounts)
          .where(eq(accounts.id, verified.response.user.id));
        if (!account) {
          await signedOut();
          return codeRefusal("INVALID_OTP");
        }
        // Now an Account: its Held names go to the Admin.
        await raiseHeldNames(ctx, account.id);
        // The Email is proven either way; new rules are accepted at sign-in.
        if (account.rulesVersion !== (await currentRules(ctx)).version) {
          await signedOut();
          return rulesChangedAtSignIn();
        }
        await recordSighting(ctx, account.id, input, "sign-in");
        const signedInAs: AccountActor = { kind: account.kind, accountId: account.id };
        return ok({ actor: signedInAs, cookies: verified.headers.getSetCookie() });
      },

      /**
       * Signs in with Email and password. An Account that has not accepted the
       * current Marketplace rules accepts them here, or is not signed in. The
       * device and IP are recorded (#140).
       */
      async signIn(
        actor: Actor,
        input: {
          email: string;
          password: string;
          acceptsRules?: { rulesVersion: number; consentsToDataUse: boolean };
        } & From &
          Seen,
      ) {
        if (actor.kind !== "visitor") return refuse("signed-in", "You are already signed in.");
        const address = email.safeParse(input.email);
        if (!address.success) return refuse("invalid", firstProblem(address.error));

        const tried = await tryWithin(ctx, [
          { key: `sign-in:${input.ip}`, ...LIMITS.signInPerIp },
          { key: `sign-in:${address.data}`, ...LIMITS.signInPerEmail },
        ]);
        if (!tried.ok) return slowDown(tried.waitSeconds);

        let signedIn;
        try {
          signedIn = await getAuth().api.signInEmail({
            body: { email: address.data, password: input.password },
            returnHeaders: true,
          });
        } catch (error) {
          if (authErrorCode(error) === "EMAIL_NOT_VERIFIED") {
            return refuse(
              "email-not-proven",
              "Prove your Email first with the code we sent it, or ask for a new code.",
            );
          }
          return wrongCredentials();
        }
        const notSignedIn = async () =>
          getAuth().api.signOut({ headers: sessionHeaders(signedIn.headers) });
        const [account] = await ctx.db
          .select({
            id: accounts.id,
            kind: accounts.kind,
            rulesVersion: accounts.rulesVersion,
            closedAt: accounts.closedAt,
          })
          .from(accounts)
          .where(eq(accounts.id, signedIn.response.user.id));
        if (!account) {
          // An Admin's identity: staff do not sign in with a password.
          await notSignedIn();
          return wrongCredentials();
        }
        // The password was right, so saying it is Closed tells nobody else anything.
        if (account.closedAt) {
          await notSignedIn();
          return closedRefusal();
        }

        const rules = await currentRules(ctx);
        if (account.rulesVersion !== rules.version) {
          const accepted = z.object(acceptance).safeParse(input.acceptsRules);
          if (!accepted.success || accepted.data.rulesVersion !== rules.version) {
            await notSignedIn();
            return rulesChangedAtSignIn();
          }
          await ctx.commit([
            ctx.db
              .update(accounts)
              .set({ rulesVersion: rules.version, rulesAcceptedAt: ctx.now() })
              .where(eq(accounts.id, account.id)),
          ]);
        }
        // In case they did not reach the Admin when the Email was proven.
        await raiseHeldNames(ctx, account.id);
        await recordSighting(ctx, account.id, input, "sign-in");
        const signedInAs: AccountActor = { kind: account.kind, accountId: account.id };
        return ok({ actor: signedInAs, cookies: signedIn.headers.getSetCookie() });
      },

      /** Ends the session the cookie carries. */
      async signOut(_actor: Actor, input: { cookie: string | null }) {
        if (!input.cookie) return ok({ cookies: [] as string[] });
        const signedOut = await getAuth().api.signOut({
          headers: new Headers({ cookie: input.cookie }),
          returnHeaders: true,
        });
        return ok({ cookies: signedOut.headers.getSetCookie() });
      },

      /**
       * The party a session cookie acts for: an Account, an Admin, or a Visitor. A
       * session in use is kept alive, with the cookies that carry it on.
       */
      async whoIs(
        _viewer: Actor,
        input: { cookie: string | null },
      ): Promise<{ actor: Actor; cookies: string[] }> {
        if (!input.cookie) return { actor: visitor, cookies: [] };
        const session = await getAuth().api.getSession({
          headers: new Headers({ cookie: input.cookie }),
          returnHeaders: true,
        });
        const identityId = session.response?.user.id;
        const signedIn =
          identityId && ((await actorFor(identityId)) ?? (await adminActorFor(ctx, identityId)));
        return { actor: signedIn || visitor, cookies: session.headers.getSetCookie() };
      },

      /**
       * Sends an Email code to set a new password. The answer is the same
       * whether or not an Account holds the Email.
       */
      async requestRecovery(actor: Actor, input: { email: string } & From) {
        if (actor.kind !== "visitor") return refuse("signed-in", "You are already signed in.");
        const address = email.safeParse(input.email);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        const refused = await mayRequestCode(ctx, address.data, input.ip);
        if (refused) return refused;

        const identity = await identityByEmail(ctx, address.data);
        if (identity && (await actorFor(identity.id))) {
          await getAuth().api.requestPasswordResetEmailOTP({ body: { email: address.data } });
        }
        return ok({ email: address.data });
      },

      /** Sets a new password with the recovery Email code. Every session ends. */
      async recover(actor: Actor, input: { email: string; code: string; password: string } & From) {
        if (actor.kind !== "visitor") return refuse("signed-in", "You are already signed in.");
        const address = email.safeParse(input.email);
        const given = code.safeParse(input.code);
        const newPassword = password.safeParse(input.password);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        if (!given.success) return refuse("invalid", firstProblem(given.error));
        if (!newPassword.success) return refuse("invalid", firstProblem(newPassword.error));

        const tooMany = await mayEnterCode(ctx, input.ip);
        if (tooMany) return tooMany;

        try {
          await getAuth().api.resetPasswordEmailOTP({
            body: { email: address.data, otp: given.data, password: newPassword.data },
          });
        } catch (error) {
          return codeRefusal(authErrorCode(error));
        }
        return ok({ email: address.data });
      },

      /**
       * How an Account appears to the viewer: an Artisan by its public name to
       * anyone; a Client to Artisans by first word and last initial, and to no
       * Visitor or other Client.
       */
      async shownName(viewer: Actor, input: { accountId: string }): Promise<string | null> {
        const [account] = await ctx.db
          .select({
            kind: accounts.kind,
            name: accounts.name,
            tradingName: accounts.tradingName,
            namesShown: accounts.namesShown,
          })
          .from(accounts)
          .innerJoin(authUsers, eq(authUsers.id, accounts.id))
          .where(and(eq(accounts.id, input.accountId), eq(authUsers.emailVerified, true)));
        if (!account) return null;
        if (viewer.kind === "admin" || accountIdOf(viewer) === input.accountId) {
          return publicName(account);
        }
        // Names the Content check has not passed are nobody else's to see.
        if (!account.namesShown) return null;
        if (account.kind === "artisan") return publicName(account);
        if (viewer.kind === "artisan") return shownName("client", account);
        return null;
      },

      /**
       * Gives the Account new names, checked like everything sent. A sure hit
       * is refused and changes nothing; unsure ones are Held, as is every
       * change of an Artisan's names, and the names shown until now stay
       * shown until the Admin releases the new ones.
       */
      async changeNames(actor: Actor, input: { name: string; tradingName?: string }) {
        const accountId = accountIdOf(actor);
        if (!accountId) return refuse("sign-in-required", "Sign in to change your names.");
        const parsed = names.safeParse(input);
        if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
        const given = { name: parsed.data.name, tradingName: parsed.data.tradingName ?? null };
        if (await heldNamesOf(ctx, accountId)) return namesBeingChecked();

        const checked = await checkNames(ctx, given);
        if (!checked.ok) return checked;
        // An Artisan's names head its Profile, every edit of which waits for the Admin.
        if (checked.value.verdict === "clear" && actor.kind !== "artisan") {
          await ctx.commit(showNames(ctx, accountId, given));
          return ok({ names: "shown" as const });
        }
        const held = holdNames(
          ctx,
          accountId,
          given,
          checked.value.verdict === "held" ? checked.value.reason : null,
        );
        try {
          await ctx.commit([held.write, raiseNames(ctx, { id: held.id, ...given })]);
        } catch (error) {
          if (causedBy(error, "UNIQUE constraint failed: names_sent.account_id")) {
            return namesBeingChecked();
          }
          throw error;
        }
        return ok({ names: "being-checked" as const });
      },

      /** Withdraws names that are being checked, leaving the names shown until now. */
      async withdrawNames(actor: Actor) {
        const accountId = accountIdOf(actor);
        if (!accountId) return refuse("sign-in-required", "Sign in to withdraw your names.");
        const held = await heldNamesOf(ctx, accountId);
        if (!held) return refuse("nothing-held", "Your names are not being checked.");
        try {
          await ctx.commit(await withdrawNames(ctx, held.id));
        } catch (error) {
          if (isAlreadyDecided(error)) return alreadyChecked();
          throw error;
        }
        return ok({});
      },

      /**
       * Closes the signed-in Account while no Engagement of it is in
       * progress: its Open Jobs close, their Sent Quotes Declined, and its
       * Sent Quotes are Withdrawn, each other party told; every session ends.
       * Its Reviews stay, and money still owed to it is still paid.
       */
      async close(actor: Actor) {
        if (actor.kind !== "client" && actor.kind !== "artisan") {
          return refuse("sign-in-required", "Sign in to close your Account.");
        }
        const closed = await closedState(ctx, actor.accountId);
        if (!closed) return refuse("sign-in-required", "Sign in to close your Account.");
        if (closed.closedAt) return closedRefusal();
        return closeAccount(ctx, actor);
      },

      /**
       * Sends an Email code to reopen a Closed Account. The answer is the
       * same whether or not a Closed Account holds the Email.
       */
      async requestReopenCode(actor: Actor, input: { email: string } & From) {
        if (actor.kind !== "visitor") return refuse("signed-in", "You are already signed in.");
        const address = email.safeParse(input.email);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        const refused = await mayRequestCode(ctx, address.data, input.ip);
        if (refused) return refused;

        const identity = await identityByEmail(ctx, address.data);
        const closed = identity && (await closedState(ctx, identity.id));
        if (closed?.closedAt && !closed.erasedAt) {
          await getAuth().api.sendVerificationOTP({
            body: { email: address.data, type: "sign-in" },
          });
        }
        return ok({ email: address.data });
      },

      /**
       * Reopens a Closed Account with its Email code and signs it in, as it
       * was: a Closed Artisan's Verification stands. Marketplace rules
       * changed meanwhile are accepted here, or it stays Closed and the code
       * still works. The device and IP are recorded, as at every sign-in.
       */
      async reopen(
        actor: Actor,
        input: {
          email: string;
          code: string;
          acceptsRules?: { rulesVersion: number; consentsToDataUse: boolean };
        } & From &
          Seen,
      ) {
        if (actor.kind !== "visitor") return refuse("signed-in", "You are already signed in.");
        const address = email.safeParse(input.email);
        const given = code.safeParse(input.code);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        if (!given.success) return refuse("invalid", firstProblem(given.error));
        const tooMany = await mayEnterCode(ctx, input.ip);
        if (tooMany) return tooMany;

        // Checked first and used only once the rules are accepted, so a code
        // stopped for the rules still works.
        try {
          await getAuth().api.checkVerificationOTP({
            body: { email: address.data, type: "sign-in", otp: given.data },
          });
        } catch (error) {
          return codeRefusal(authErrorCode(error));
        }
        const identity = await identityByEmail(ctx, address.data);
        const [account] = identity
          ? await ctx.db
              .select({
                id: accounts.id,
                kind: accounts.kind,
                rulesVersion: accounts.rulesVersion,
                closedAt: accounts.closedAt,
                erasedAt: accounts.erasedAt,
              })
              .from(accounts)
              .where(eq(accounts.id, identity.id))
          : [];
        // An Admin's sign-in code is not one.
        if (!account?.closedAt || account.erasedAt) return codeRefusal("INVALID_OTP");
        const rules = await currentRules(ctx);
        const rulesChanged = account.rulesVersion !== rules.version;
        if (rulesChanged) {
          const accepted = z.object(acceptance).safeParse(input.acceptsRules);
          if (!accepted.success || accepted.data.rulesVersion !== rules.version) {
            return rulesChangedAtSignIn();
          }
        }

        let signedIn;
        try {
          signedIn = await getAuth().api.signInEmailOTP({
            body: { email: address.data, otp: given.data },
            returnHeaders: true,
          });
        } catch (error) {
          return codeRefusal(authErrorCode(error));
        }
        const now = ctx.now();
        await ctx.commit([
          ctx.db
            .update(accounts)
            .set({
              closedAt: null,
              ...(rulesChanged ? { rulesVersion: rules.version, rulesAcceptedAt: now } : {}),
            })
            .where(and(eq(accounts.id, account.id), eq(accounts.closedAt, account.closedAt))),
        ]);
        await recordSighting(ctx, account.id, input, "sign-in");
        const signedInAs: AccountActor = { kind: account.kind, accountId: account.id };
        return ok({ actor: signedInAs, cookies: signedIn.headers.getSetCookie() });
      },

      /**
       * Sends an Email code to the new address the signed-in Account gives.
       * Its Email stays as it is, and signs in, until the code is entered. An
       * address any Account or an Admin holds is refused.
       */
      async requestEmailChange(
        actor: Actor,
        input: { email: string; cookie: string | null } & From,
      ) {
        const session = await sessionOf(actor, input.cookie);
        if (!session) return refuse("sign-in-required", "Sign in to change your Email.");
        const address = email.safeParse(input.email);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        if (address.data === session.email) {
          return refuse("same-email", "That is your Email already. Give the new one.");
        }
        const taken = await takeAddress(ctx, address.data);
        if (!taken.ok) return taken;
        const refused = await mayRequestCode(ctx, address.data, input.ip);
        if (refused) return refused;

        if (taken.writes.length > 0) await ctx.commit(taken.writes);
        await getAuth().api.requestEmailChangeEmailOTP({
          body: { newEmail: address.data },
          headers: session.headers,
        });
        return ok({ email: address.data });
      },

      /**
       * Proves the new address with its Email code, which makes it the
       * Account's Email; the old one no longer signs in and is told by email.
       * The session goes on, with the cookies that carry it.
       */
      async changeEmail(
        actor: Actor,
        input: { email: string; code: string; cookie: string | null } & From,
      ) {
        const session = await sessionOf(actor, input.cookie);
        if (!session) return refuse("sign-in-required", "Sign in to change your Email.");
        const address = email.safeParse(input.email);
        const given = code.safeParse(input.code);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        if (!given.success) return refuse("invalid", firstProblem(given.error));
        const tooMany = await mayEnterCode(ctx, input.ip);
        if (tooMany) return tooMany;
        // Another Account may have taken it while the code waited.
        const taken = await takeAddress(ctx, address.data);
        if (!taken.ok) return taken;
        if (taken.writes.length > 0) await ctx.commit(taken.writes);

        let changed;
        try {
          changed = await getAuth().api.changeEmailEmailOTP({
            body: { newEmail: address.data, otp: given.data },
            headers: session.headers,
            returnHeaders: true,
          });
        } catch (error) {
          if (isAddressTaken(error)) return heldRefusal();
          return codeRefusal(authErrorCode(error));
        }
        await ctx.commit([toldOldAddress(ctx, session.email)]);
        await emailTells(ctx).catch((error: unknown) => {
          console.error("Tell emails did not go", error);
        });
        return ok({ email: address.data, cookies: changed.headers.getSetCookie() });
      },

      /**
       * States the Artisan's VAT number, or clears it once they are not
       * VAT-registered. Their Quotes sent or revised from now on carry it.
       */
      async setVatNumber(actor: Actor, input: { vatNumber: string }) {
        if (actor.kind !== "artisan") {
          return refuse("artisans-only", "Only an Artisan states a VAT number.");
        }
        const parsed = vatNumber.safeParse(input.vatNumber);
        if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
        await ctx.db
          .update(accounts)
          .set({ vatNumber: parsed.data })
          .where(eq(accounts.id, actor.accountId));
        return ok({});
      },

      /** The signed-in Account as it sees itself. */
      async me(viewer: Actor) {
        const accountId = accountIdOf(viewer);
        if (!accountId) return null;
        const [row] = await ctx.db
          .select({
            id: accounts.id,
            kind: accounts.kind,
            name: accounts.name,
            tradingName: accounts.tradingName,
            email: authUsers.email,
            rulesVersion: accounts.rulesVersion,
            rulesAcceptedAt: accounts.rulesAcceptedAt,
            namesShown: accounts.namesShown,
            vatNumber: accounts.vatNumber,
          })
          .from(accounts)
          .innerJoin(authUsers, eq(authUsers.id, accounts.id))
          .where(eq(accounts.id, accountId));
        if (!row) return null;
        const [namesNow, standing, verified] = await Promise.all([
          namesStanding(ctx, row.id),
          standingOf(ctx, row.id),
          row.kind === "artisan" ? verificationSettingsOf(ctx, row.id) : null,
        ]);
        return {
          accountId: row.id,
          kind: row.kind,
          name: row.name,
          tradingName: row.tradingName,
          publicName: publicName(row),
          /**
           * Whether others see the names; new names being checked, which
           * only this Account sees; and names the Admin refused, with why.
           */
          names: { shown: row.namesShown, ...namesNow },
          email: row.email,
          rules: { version: row.rulesVersion, acceptedAt: row.rulesAcceptedAt },
          /** An Artisan's VAT number, if they are VAT-registered. */
          vatNumber: row.vatNumber,
          /** Its Suspension, with the reason, while one stands, and its warnings (#136). */
          standing,
          /** An Artisan's Identity Number, read only, which it keeps while Closed (#141). */
          identityNumber: verified?.identityNumber ?? null,
          /** An Artisan's current Payout account: its bank and the end of its number. */
          payoutAccount: verified?.payoutAccount ?? null,
          // A Client may post a Job at once; an Artisan is verified first.
          nextStep: row.kind === "client" ? ("post-first-job" as const) : ("verification" as const),
        };
      },
    };
  },
});

function rulesChangedAtSignIn() {
  return refuse(
    "accept-rules",
    "The Marketplace rules have changed. Read and accept them to sign in.",
  );
}

function namesBeingChecked() {
  return refuse(
    "names-being-checked",
    "Your names are being checked. Withdraw them to give other names.",
  );
}

function wrongCredentials() {
  return refuse("wrong-credentials", "That Email and password do not match an Account.");
}
