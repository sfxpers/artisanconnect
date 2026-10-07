import * as z from "zod";

// Shared with the web app's forms, so a field is refused the same way in both.
// Nothing here may import what only runs on the server.

/** An Email code works once, for ten minutes, and dies after five wrong tries. */
export const EMAIL_CODE = { length: 6, minutes: 10, wrongTries: 5 } as const;
export const PASSWORD_LENGTH = { min: 10, max: 128 } as const;

export const NAME_MAX = 80;

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Give a valid Email." }));

export const password = z
  .string()
  .min(PASSWORD_LENGTH.min, { error: `Use at least ${PASSWORD_LENGTH.min} characters.` })
  .max(PASSWORD_LENGTH.max, { error: `Use at most ${PASSWORD_LENGTH.max} characters.` });

export const name = z
  .string()
  .trim()
  .min(1, { error: "Give your name." })
  .max(NAME_MAX, { error: `Keep your name to ${NAME_MAX} characters.` });

/** A trading name as typed; empty means none. */
export const tradingNameText = z
  .string()
  .trim()
  .max(NAME_MAX, { error: `Keep the trading name to ${NAME_MAX} characters.` });

export const tradingName = tradingNameText.optional().transform((value) => value || undefined);

/** Acceptance of a Marketplace rules version, with POPIA consent. */
export const acceptance = {
  rulesVersion: z.number().int(),
  consentsToDataUse: z.literal(true, {
    error: "Accept the Marketplace rules and consent to how your data is used.",
  }),
};

/** An Account's names, as given at sign-up or changed later. */
export const names = z.object({ name, tradingName });

export const signUpDetails = z.object({
  kind: z.enum(["client", "artisan"], { error: "Choose Client or Artisan." }),
  name,
  tradingName,
  email,
  password,
  ...acceptance,
});

export type SignUpDetails = z.input<typeof signUpDetails>;

export const code = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${EMAIL_CODE.length}}$`), {
    error: `The code is the ${EMAIL_CODE.length} digits in the email.`,
  });

/** The first problem with an input, said for the person. */
export function firstProblem(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check what you entered.";
}

/**
 * A VAT-registered Artisan's VAT number, as SARS issues it: ten digits
 * starting with 4. Spaces are dropped; nothing given means not registered.
 */
export const vatNumber = z
  .string()
  .transform((value) => value.replace(/\s/g, ""))
  .refine((value) => value === "" || /^4\d{9}$/.test(value), {
    error: "A VAT number is ten digits starting with 4, like 4123456789.",
  })
  .transform((value) => value || null);
