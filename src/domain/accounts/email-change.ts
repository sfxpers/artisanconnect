import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import type { Context, Write } from "../context";
import { refuse } from "../result";
import { authUsers } from "../schema";
import { emailAddress } from "../tells";
import { hasLiveSignUpCode, identityByEmail } from "./codes";
import { EMAIL_CODE } from "./inputs";

// Changing an Account's Email (#141): the new address is proven by an Email
// code, and the old one signs in until then and is told once it is done.

/**
 * Whether the Account may take the address: refused while any Account or an
 * Admin holds it, or a sign-up waits on its code; otherwise the write that
 * clears an unproven sign-up whose code stopped working, if one holds it, as
 * a new sign-up would.
 */
export async function takeAddress(
  ctx: Context,
  address: string,
): Promise<{ ok: true; writes: Write[] } | ReturnType<typeof refuse>> {
  const held = await identityByEmail(ctx, address);
  if (!held) return { ok: true, writes: [] };
  if (held.emailVerified || held.role === "admin") return heldRefusal();
  if (await hasLiveSignUpCode(ctx, address)) {
    return refuse(
      "sign-up-waiting",
      `A sign-up with this Email is waiting for its code. Try again once it stops working, ${EMAIL_CODE.minutes} minutes after it was sent.`,
    );
  }
  return { ok: true, writes: [ctx.db.delete(authUsers).where(eq(authUsers.id, held.id))] };
}

export function heldRefusal() {
  return refuse("held", "This Email is held by another Account or an Admin. Give another.");
}

/** Whether better-auth refused the change because another identity took the address meanwhile. */
export function isAddressTaken(error: unknown) {
  return (
    isAPIError(error) &&
    /already in use/i.test(String((error.body as { message?: string } | undefined)?.message))
  );
}

/** The write that tells the old address, by email, that the Email changed; it names no new one. */
export function toldOldAddress(ctx: Context, oldAddress: string): Write {
  return emailAddress(ctx, oldAddress, {
    event: "account.email-changed",
    title: "Your ArtisanConnect Email was changed",
    link: "/account",
    body: [
      "The Email of your ArtisanConnect Account was changed. From now on you sign in with the new one, and this one no longer signs in.",
      "If you did not change it, someone else may have been signed in to your Account.",
    ].join("\n\n"),
  });
}
