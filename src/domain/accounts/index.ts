import * as z from "zod";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { accountIdOf, visitor, type AccountActor, type Actor } from "../actor";
import { tryWithin } from "../rate-limits";
import { ok, refuse } from "../result";
import { adminActorFor } from "../admins/identity";
import { accounts, authUsers } from "../schema";
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
  password,
  signUpDetails,
  type SignUpDetails,
} from "./inputs";
import { clientShownName, publicName } from "./names";
import { currentRules } from "./rules";

export const accountsSection = defineSection({
  name: "accounts",
  api: (ctx) => {
    let auth: Auth | undefined;
    const getAuth = () => (auth ??= createAuth(ctx));

    async function actorFor(identityId: string): Promise<AccountActor | null> {
      const [account] = await ctx.db
        .select({ id: accounts.id, kind: accounts.kind })
        .from(accounts)
        .where(eq(accounts.id, identityId));
      return account ? { kind: account.kind, accountId: account.id } : null;
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
        await ctx.commit([
          ctx.db.insert(accounts).values({
            id: created.user.id,
            kind: details.kind,
            name: details.name,
            tradingName: details.tradingName ?? null,
            rulesVersion: rules.version,
            rulesAcceptedAt: now,
            signedUpAt: now,
          }),
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

      /** Proves the Email with its Email code, which makes the Account and signs it in. */
      async confirmEmail(actor: Actor, input: { email: string; code: string } & From) {
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
        // The Email is proven either way; new rules are accepted at sign-in.
        if (account.rulesVersion !== (await currentRules(ctx)).version) {
          await signedOut();
          return rulesChangedAtSignIn();
        }
        const signedInAs: AccountActor = { kind: account.kind, accountId: account.id };
        return ok({ actor: signedInAs, cookies: verified.headers.getSetCookie() });
      },

      /**
       * Signs in with Email and password. An Account that has not accepted the
       * current Marketplace rules accepts them here, or is not signed in.
       */
      async signIn(
        actor: Actor,
        input: {
          email: string;
          password: string;
          acceptsRules?: { rulesVersion: number; consentsToDataUse: boolean };
        } & From,
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
          .select({ id: accounts.id, kind: accounts.kind, rulesVersion: accounts.rulesVersion })
          .from(accounts)
          .where(eq(accounts.id, signedIn.response.user.id));
        if (!account) {
          // An Admin's identity: staff do not sign in with a password.
          await notSignedIn();
          return wrongCredentials();
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
          .select({ kind: accounts.kind, name: accounts.name, tradingName: accounts.tradingName })
          .from(accounts)
          .innerJoin(authUsers, eq(authUsers.id, accounts.id))
          .where(and(eq(accounts.id, input.accountId), eq(authUsers.emailVerified, true)));
        if (!account) return null;
        if (account.kind === "artisan") return publicName(account);
        if (viewer.kind === "artisan") return clientShownName(publicName(account));
        if (viewer.kind === "admin" || accountIdOf(viewer) === input.accountId) {
          return publicName(account);
        }
        return null;
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
          })
          .from(accounts)
          .innerJoin(authUsers, eq(authUsers.id, accounts.id))
          .where(eq(accounts.id, accountId));
        if (!row) return null;
        return {
          accountId: row.id,
          kind: row.kind,
          name: row.name,
          tradingName: row.tradingName,
          publicName: publicName(row),
          email: row.email,
          rules: { version: row.rulesVersion, acceptedAt: row.rulesAcceptedAt },
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

function wrongCredentials() {
  return refuse("wrong-credentials", "That Email and password do not match an Account.");
}
