import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { isAPIError } from "better-auth/api";
import { admin, emailOTP } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { Context } from "../context";
import { authCredentials, authSessions, authUsers, authVerifications } from "../schema";
import { EMAIL_CODE, PASSWORD_LENGTH } from "./inputs";

type CodePurpose = "sign-in" | "email-verification" | "forget-password" | "change-email";

const CODE_EMAIL_SUBJECT: Record<CodePurpose, string> = {
  "email-verification": "Your ArtisanConnect sign-up code",
  "forget-password": "Your ArtisanConnect recovery code",
  "sign-in": "Your ArtisanConnect sign-in code",
  "change-email": "Your ArtisanConnect Email code",
};

/**
 * better-auth (ADR 0017): Email and password plus Email codes. No social
 * login, SMS, or switcher. Its admin plugin only marks staff by role: every
 * role, the Admin's included, holds no better-auth permission, so its
 * impersonation and user management are off. Nothing reaches it but this
 * module's commands; its HTTP handler is never mounted.
 */
export function createAuth(ctx: Context) {
  const ac = createAccessControl(defaultStatements);
  const noPermissions = ac.newRole({ user: [], session: [] });
  return betterAuth({
    baseURL: ctx.config.appUrl,
    secret: ctx.config.authSecret,
    database: drizzleAdapter(ctx.db, {
      provider: "sqlite",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authCredentials,
        verification: authVerifications,
      },
    }),
    telemetry: { enabled: false },
    // The module's own limits apply (rate-limits.ts), on the fake clock.
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: "artisanconnect",
      database: { generateId: () => ctx.newId() },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_LENGTH.min,
      maxPasswordLength: PASSWORD_LENGTH.max,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: { autoSignInAfterVerification: true },
    plugins: [
      emailOTP({
        otpLength: EMAIL_CODE.length,
        expiresIn: EMAIL_CODE.minutes * 60,
        allowedAttempts: EMAIL_CODE.wrongTries,
        storeOTP: "hashed",
        // A new code replaces the old one, which stops working.
        resendStrategy: "rotate",
        disableSignUp: true,
        // A new Email is proven by a code sent to it; the old one signs in until then.
        changeEmail: { enabled: true },
        async sendVerificationOTP({ email, otp, type }) {
          await ctx.ports.mailer.send({
            to: email,
            subject: CODE_EMAIL_SUBJECT[type],
            text: [
              `Your code is ${otp}.`,
              `It works once, for ${EMAIL_CODE.minutes} minutes.`,
              "If you did not ask for it, you can ignore this email.",
            ].join("\n\n"),
          });
        },
      }),
      admin({
        ac,
        roles: { admin: noPermissions, user: noPermissions },
        adminRoles: ["admin"],
        defaultRole: "user",
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** The better-auth error code a call failed with, or rethrows what is not one. */
export function authErrorCode(error: unknown): string {
  if (isAPIError(error)) return String((error.body as { code?: string } | undefined)?.code ?? "");
  throw error;
}
