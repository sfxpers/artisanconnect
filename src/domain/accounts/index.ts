import * as z from "zod";
import { and, eq } from "drizzle-orm";
import { accountIdOf, visitor, type AccountActor, type Actor } from "../actor";
import { tryWithin } from "../rate-limits";
import { ok, refuse } from "../result";
import { accounts, authUsers } from "../schema";
import { defineSection } from "../section";
import { authErrorCode, createAuth, type Auth } from "./auth";
import {
  acceptance,
  code,
  email,
  firstProblem,
  password,
  signUpDetails,
  type SignUpDetails,
} from "./inputs";
import { clientShownName, publicName } from "./names";
import { currentRules } from "./rules";

/** Where the request came from, for rate limits. */
type From = { ip: string };

const LIMITS = {
  signUpPerIp: { max: 10, seconds: 60 * 60 },
  /** A new Email code only after 60 seconds. */
  codePerEmail: { max: 1, seconds: 60 },
  codeRequestPerIp: { max: 10, seconds: 15 * 60 },
  codeEntryPerIp: { max: 30, seconds: 15 * 60 },
  signInPerIp: { max: 30, seconds: 15 * 60 },
  signInPerEmail: { max: 10, seconds: 15 * 60 },
} as const;

function waitForCode(waitSeconds: number) {
  return refuse(
    "wait",
    `A code was sent less than a minute ago. Wait ${waitSeconds} seconds before asking for a new one.`,
  );
}

function slowDown(waitSeconds: number) {
  return refuse(
    "slow-down",
    `Too many tries. Wait ${waitSeconds} seconds${waitSeconds >= 120 ? ` (about ${Math.ceil(waitSeconds / 60)} minutes)` : ""} and try again.`,
  );
}

export const accountsSection = defineSection({
  name: "accounts",
  api: (ctx) => {
    let auth: Auth | undefined;
    const getAuth = () => (auth ??= createAuth(ctx));

    async function identityByEmail(address: string) {
      const [identity] = await ctx.db.select().from(authUsers).where(eq(authUsers.email, address));
      return identity ?? null;
    }

    /**
     * Counts a code request for the IP, then the Email, so a request the IP's
     * limit refuses leaves the Email's 60 seconds alone. Neither depends on
     * whether anyone holds the Email.
     */
    async function mayRequestCode(address: string, ip: string) {
      const perIp = await tryWithin(ctx, [
        { key: `code-request:${ip}`, ...LIMITS.codeRequestPerIp },
      ]);
      if (!perIp.ok) return slowDown(perIp.waitSeconds);
      const perEmail = await tryWithin(ctx, [{ key: `code:${address}`, ...LIMITS.codePerEmail }]);
      if (!perEmail.ok) return waitForCode(perEmail.waitSeconds);
      return null;
    }

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
       * sign-up, not an Account, and another sign-up with the Email replaces it.
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

        const held = await identityByEmail(details.email);
        if (held?.emailVerified || held?.role === "admin") {
          return refuse(
            "email-held",
            "This Email is already used. Sign in, or sign up with another Email.",
          );
        }
        const refused = await mayRequestCode(details.email, input.ip);
        if (refused) return refused;

        // Nobody has proven this Email, so nobody holds it yet. better-auth
        // writes the identity itself, so this is not one batch: a sign-up left
        // half made is unproven, and the next sign-up with the Email replaces it.
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
        const refused = await mayRequestCode(address.data, input.ip);
        if (refused) return refused;

        const identity = await identityByEmail(address.data);
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

        const tried = await tryWithin(ctx, [
          { key: `code-entry:${input.ip}`, ...LIMITS.codeEntryPerIp },
        ]);
        if (!tried.ok) return slowDown(tried.waitSeconds);

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
       * The party a session cookie acts for: an Account, or a Visitor. A
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
        const signedIn = session.response && (await actorFor(session.response.user.id));
        return { actor: signedIn ?? visitor, cookies: session.headers.getSetCookie() };
      },

      /**
       * Sends an Email code to set a new password. The answer is the same
       * whether or not an Account holds the Email.
       */
      async requestRecovery(actor: Actor, input: { email: string } & From) {
        if (actor.kind !== "visitor") return refuse("signed-in", "You are already signed in.");
        const address = email.safeParse(input.email);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        const refused = await mayRequestCode(address.data, input.ip);
        if (refused) return refused;

        const identity = await identityByEmail(address.data);
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

        const tried = await tryWithin(ctx, [
          { key: `code-entry:${input.ip}`, ...LIMITS.codeEntryPerIp },
        ]);
        if (!tried.ok) return slowDown(tried.waitSeconds);

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

/** Request headers carrying the session a response just set. */
function sessionHeaders(response: Headers): Headers {
  return new Headers({
    cookie: response
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
  });
}

function codeRefusal(errorCode: string) {
  switch (errorCode) {
    case "OTP_EXPIRED":
      return refuse("code-expired", "That code has expired. Ask for a new one.");
    case "TOO_MANY_ATTEMPTS":
      return refuse("code-used-up", "That code was tried too many times. Ask for a new one.");
    default:
      return refuse("wrong-code", "That code is not right. Check the email and try again.");
  }
}
