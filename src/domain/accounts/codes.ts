import { and, eq, gt } from "drizzle-orm";
import type { Context } from "../context";
import { tryWithin } from "../rate-limits";
import { refuse } from "../shared/result";
import { authUsers, authVerifications } from "../schema";

// What every way of sending or entering an Email code shares: an Account's
// sign-up and recovery, and an Admin's sign-in.

// Per Email, exactly and on the domain's clock. Floods from one network are
// stopped before the module, by the Workers Rate Limiting binding (src/web/session.ts).
export const LIMITS = {
  /** A new Email code only after 60 seconds. */
  codePerEmail: { max: 1, seconds: 60 },
  signInPerEmail: { max: 10, seconds: 15 * 60 },
} as const;

function waitForCode(waitSeconds: number) {
  return refuse(
    "wait",
    `A code was sent less than a minute ago. Wait ${waitSeconds} seconds before asking for a new one.`,
  );
}

export function slowDown(waitSeconds: number) {
  return refuse(
    "slow-down",
    `Too many tries. Wait ${waitSeconds} seconds${waitSeconds >= 120 ? ` (about ${Math.ceil(waitSeconds / 60)} minutes)` : ""} and try again.`,
  );
}

/** Counts a code request for the Email, whether or not anyone holds it. */
export async function mayRequestCode(ctx: Context, address: string) {
  const perEmail = await tryWithin(ctx, [{ key: `code:${address}`, ...LIMITS.codePerEmail }]);
  return perEmail.ok ? null : waitForCode(perEmail.waitSeconds);
}

/** The sign-in identity holding an Email: an Account's, a sign-up's, or an Admin's. */
export async function identityByEmail(ctx: Context, address: string) {
  const [identity] = await ctx.db.select().from(authUsers).where(eq(authUsers.email, address));
  return identity ?? null;
}

/** Whether a sign-up code sent to the Email still works. */
export async function hasLiveSignUpCode(ctx: Context, address: string) {
  const [live] = await ctx.db
    .select({ id: authVerifications.id })
    .from(authVerifications)
    .where(
      and(
        eq(authVerifications.identifier, `email-verification-otp-${address}`),
        gt(authVerifications.expiresAt, ctx.now()),
      ),
    );
  return live !== undefined;
}

/** Request headers carrying the session a response just set. */
export function sessionHeaders(response: Headers): Headers {
  return new Headers({
    cookie: response
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
  });
}

export function codeRefusal(errorCode: string) {
  switch (errorCode) {
    case "OTP_EXPIRED":
      return refuse("code-expired", "That code has expired. Ask for a new one.");
    case "TOO_MANY_ATTEMPTS":
      return refuse("code-used-up", "That code was tried too many times. Ask for a new one.");
    default:
      return refuse("wrong-code", "That code is not right. Check the email and try again.");
  }
}
