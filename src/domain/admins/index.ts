import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Actor } from "../actor";
import { authErrorCode, createAuth, type Auth } from "../accounts/auth";
import {
  codeRefusal,
  mayEnterCode,
  mayRequestCode,
  sessionHeaders,
  type From,
} from "../accounts/codes";
import { code, email, firstProblem } from "../accounts/inputs";
import { audit } from "../audit";
import type { Context } from "../context";
import { causedBy } from "../errors";
import { adminOnly, ok, refuse } from "../result";
import { admins, auditLog, authUsers } from "../schema";
import { defineSection } from "../section";
import { emailTells, tellAddress } from "../tells";
import { adminActorFor, newAdmin } from "./identity";

/** How many audit log rows one page holds. */
const AUDIT_PAGE = 100;

/**
 * The deploy-time setup command: makes the first Admin (ADR 0015). Once there
 * is one, every other is invited by an Admin.
 */
export async function setUpFirstAdmin(ctx: Context, input: { email: string }) {
  const address = email.safeParse(input.email);
  if (!address.success) return refuse("invalid", firstProblem(address.error));
  const [anyAdmin] = await ctx.db
    .select({ id: admins.id })
    .from(admins)
    .where(isNull(admins.removedAt))
    .limit(1);
  if (anyAdmin) {
    return refuse(
      "admin-exists",
      "There is already an Admin. Further Admins are invited from the Admins page.",
    );
  }
  const made = await newAdmin(ctx, address.data, null);
  if (!made.ok) return made;
  try {
    await ctx.commit(made.writes);
  } catch (error) {
    if (isUniqueEmailViolation(error)) return refuse("held", "This Email is already held.");
    throw error;
  }
  return ok({ adminId: made.id, email: address.data });
}

export const adminsSection = defineSection({
  name: "admins",
  api: (ctx) => {
    let auth: Auth | undefined;
    const getAuth = () => (auth ??= createAuth(ctx));

    return {
      /**
       * Sends an Email code to sign in. Only an Admin's Email is sent one, but
       * the answer is the same for any Email, so nobody can probe who is staff.
       */
      async requestSignInCode(actor: Actor, input: { email: string } & From) {
        if (actor.kind !== "visitor") return refuse("signed-in", "You are already signed in.");
        const address = email.safeParse(input.email);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        const refused = await mayRequestCode(ctx, address.data, input.ip);
        if (refused) return refused;

        const [admin] = await ctx.db
          .select({ id: admins.id })
          .from(admins)
          .where(and(eq(admins.email, address.data), isNull(admins.removedAt)));
        if (admin) {
          await getAuth().api.sendVerificationOTP({
            body: { email: address.data, type: "sign-in" },
          });
        }
        return ok({ email: address.data });
      },

      /** Signs an Admin in with its Email code: the only way an Admin signs in. */
      async signIn(actor: Actor, input: { email: string; code: string } & From) {
        if (actor.kind !== "visitor") return refuse("signed-in", "You are already signed in.");
        const address = email.safeParse(input.email);
        const given = code.safeParse(input.code);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        if (!given.success) return refuse("invalid", firstProblem(given.error));
        const tooMany = await mayEnterCode(ctx, input.ip);
        if (tooMany) return tooMany;

        let signedIn;
        try {
          signedIn = await getAuth().api.signInEmailOTP({
            body: { email: address.data, otp: given.data },
            returnHeaders: true,
          });
        } catch (error) {
          return codeRefusal(authErrorCode(error));
        }
        const admin = await adminActorFor(ctx, signedIn.response.user.id);
        if (!admin) {
          // Only an Admin is sent a sign-in code; an Account signs in with its password.
          await getAuth().api.signOut({ headers: sessionHeaders(signedIn.headers) });
          return codeRefusal("INVALID_OTP");
        }
        return ok({ actor: admin, cookies: signedIn.headers.getSetCookie() });
      },

      /** The signed-in Admin as it sees itself. */
      async me(viewer: Actor) {
        if (viewer.kind !== "admin") return null;
        const [admin] = await ctx.db
          .select({ adminId: admins.id, email: admins.email })
          .from(admins)
          .where(and(eq(admins.id, viewer.adminId), isNull(admins.removedAt)));
        return admin ?? null;
      },

      /** Every Admin, oldest first, and whether each may be removed now. */
      async list(viewer: Actor) {
        if (viewer.kind !== "admin") return null;
        const inviter = alias(admins, "inviter");
        const rows = await ctx.db
          .select({
            adminId: admins.id,
            email: admins.email,
            invitedAt: admins.invitedAt,
            invitedBy: inviter.email,
          })
          .from(admins)
          .leftJoin(inviter, eq(inviter.id, admins.invitedBy))
          .where(isNull(admins.removedAt))
          .orderBy(admins.invitedAt, admins.id);
        return rows.map((row) => ({
          ...row,
          you: row.adminId === viewer.adminId,
          // An Admin may remove another, or itself, but never the last.
          removable: rows.length > 1,
        }));
      },

      /**
       * Makes another Email an Admin's. The invite is a Tell to that address;
       * the new Admin signs in there with an Email code.
       */
      async invite(actor: Actor, input: { email: string }) {
        if (actor.kind !== "admin") return adminOnly();
        const address = email.safeParse(input.email);
        if (!address.success) return refuse("invalid", firstProblem(address.error));
        const made = await newAdmin(ctx, address.data, actor);
        if (!made.ok) return made;
        try {
          await ctx.commit([
            ...made.writes,
            tellAddress(ctx, address.data, {
              event: "admin-invited",
              title: "You are invited to be an ArtisanConnect Admin",
              link: "/admin/sign-in",
            }),
            audit(ctx, actor, {
              action: "admin.invited",
              summary: `Invited ${address.data} as an Admin`,
              subjectId: made.id,
            }),
          ]);
        } catch (error) {
          // Another request took the Email first.
          if (isUniqueEmailViolation(error)) return refuse("held", "This Email is already held.");
          throw error;
        }
        await emailTells(ctx);
        return ok({ adminId: made.id, email: address.data });
      },

      /**
       * Removes an Admin, which ends its sign-in identity and every session.
       * Never the last Admin.
       */
      async remove(actor: Actor, input: { adminId: string }) {
        if (actor.kind !== "admin") return adminOnly();
        const [target] = await ctx.db
          .select({ id: admins.id, email: admins.email })
          .from(admins)
          .where(and(eq(admins.id, input.adminId), isNull(admins.removedAt)));
        if (!target) return refuse("not-found", "That Admin does not exist or was removed.");
        const [current] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(admins)
          .where(isNull(admins.removedAt));
        if ((current?.count ?? 0) <= 1) return lastAdmin();
        try {
          await ctx.commit([
            // A trigger refuses this if it would leave no Admin.
            ctx.db
              .update(admins)
              .set({ removedAt: ctx.now(), removedBy: actor.adminId })
              .where(eq(admins.id, target.id)),
            ctx.db.delete(authUsers).where(eq(authUsers.id, target.id)),
            audit(ctx, actor, {
              action: "admin.removed",
              summary: `Removed ${target.email} as an Admin`,
              subjectId: target.id,
            }),
          ]);
        } catch (error) {
          if (causedBy(error, "the last Admin cannot be removed")) return lastAdmin();
          throw error;
        }
        return ok({ adminId: target.id });
      },

      /**
       * The audit log, newest first: who did or read what, and when, a page at
       * a time. Pass `next` back as `before` for the page after.
       */
      async auditLog(viewer: Actor, input: { before?: string } = {}) {
        if (viewer.kind !== "admin") return null;
        const before = input.before ? parseCursor(input.before) : null;
        const rows = await ctx.db
          .select({
            id: auditLog.id,
            at: auditLog.at,
            adminId: auditLog.adminId,
            admin: admins.email,
            action: auditLog.action,
            summary: auditLog.summary,
            subjectId: auditLog.subjectId,
          })
          .from(auditLog)
          .innerJoin(admins, eq(admins.id, auditLog.adminId))
          .where(
            before
              ? or(
                  lt(auditLog.at, before.at),
                  and(eq(auditLog.at, before.at), lt(auditLog.id, before.id)),
                )
              : undefined,
          )
          .orderBy(desc(auditLog.at), desc(auditLog.id))
          .limit(AUDIT_PAGE + 1);
        const page = rows.slice(0, AUDIT_PAGE);
        const last = page.at(-1);
        return {
          rows: page,
          next: rows.length > AUDIT_PAGE && last ? `${last.at.getTime()}:${last.id}` : null,
        };
      },
    };
  },
});

function lastAdmin() {
  return refuse("last-admin", "This is the last Admin. Invite another before removing it.");
}

/** A page's `next`, or null for one that is not, which reads from the newest. */
function parseCursor(cursor: string) {
  const [at, ...id] = cursor.split(":");
  const time = Number(at);
  return Number.isSafeInteger(time) && id.length > 0
    ? { at: new Date(time), id: id.join(":") }
    : null;
}

function isUniqueEmailViolation(error: unknown) {
  return causedBy(error, "UNIQUE constraint failed: auth_users.email");
}
