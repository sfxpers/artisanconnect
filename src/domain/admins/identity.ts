import { and, eq, isNull } from "drizzle-orm";
import type { AdminActor } from "../actor";
import type { Context, Write } from "../context";
import { hasLiveSignUpCode, identityByEmail } from "../accounts/codes";
import { EMAIL_CODE } from "../accounts/inputs";
import { refuse } from "../result";
import { admins, authUsers } from "../schema";

/** The Admin a sign-in identity is, while it is one. */
export async function adminActorFor(ctx: Context, identityId: string): Promise<AdminActor | null> {
  const [admin] = await ctx.db
    .select({ id: admins.id })
    .from(admins)
    .where(and(eq(admins.id, identityId), isNull(admins.removedAt)));
  return admin ? { kind: "admin", adminId: admin.id } : null;
}

/**
 * The writes that make an Email an Admin's: a sign-in identity with no
 * password, which signs in with an Email code only, and its Admin row. An
 * Email any Account or Admin holds is refused. A sign-up whose Email is not
 * proven holds nothing, so once its code stops working it is replaced, as
 * another sign-up would replace it.
 */
export async function newAdmin(ctx: Context, address: string, invitedBy: AdminActor | null) {
  const held = await identityByEmail(ctx, address);
  if (held?.role === "admin") {
    return refuse("already-admin", "This Email is already an Admin's.");
  }
  if (held?.emailVerified) {
    return refuse("held-by-account", "This Email holds an Account. An Admin is not an Account.");
  }
  if (held && (await hasLiveSignUpCode(ctx, address))) {
    return refuse(
      "sign-up-waiting",
      `A sign-up with this Email is waiting for its code. Try again once it stops working, ${EMAIL_CODE.minutes} minutes after it was sent.`,
    );
  }
  const id = ctx.newId();
  const now = ctx.now();
  return {
    ok: true as const,
    id,
    writes: <Write[]>[
      ...(held ? [ctx.db.delete(authUsers).where(eq(authUsers.id, held.id))] : []),
      ctx.db.insert(authUsers).values({
        id,
        // An Admin is known by its Email.
        name: address,
        email: address,
        emailVerified: true,
        role: "admin",
        createdAt: now,
        updatedAt: now,
      }),
      ctx.db.insert(admins).values({
        id,
        email: address,
        invitedBy: invitedBy?.adminId ?? null,
        invitedAt: now,
      }),
    ],
  };
}
