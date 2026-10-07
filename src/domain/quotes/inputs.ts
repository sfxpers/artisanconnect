// Shared with the web app's form, so a Quote is refused the same way in both.
// Nothing here may import what only runs on the server.

import * as z from "zod";
import { isDay } from "../sa-days";

/** Who supplies the materials: the Artisan, the Client, or both, the scope naming the Client's part. */
export const MATERIALS_BY = ["artisan", "client", "both"] as const;
export type MaterialsBy = (typeof MATERIALS_BY)[number];

export const SCOPE_MAX = 2000;
export const WARRANTY_MAX = 500;
export const DURATION_MAX_DAYS = 365;
/** The least a Quote totals, Labour plus Materials, in cents: R300. */
export const QUOTE_MIN_CENTS = 30_000;
/** The most either line may be, in cents: R10 000 000. */
const LINE_MAX_CENTS = 1_000_000_000;

/** How long a Quote is Sent before it Expires. */
export const QUOTE_DAYS = 14;
/** The Quotes a Job takes, counted from when it last opened. */
export const QUOTES_MAX = 5;

/** Rands as typed, "1500", "1 500.50", or "1500,5", as whole cents. */
export const rands = (label: string) =>
  z
    .union([z.string(), z.number()], { error: `Give the ${label} in rands.` })
    .transform((value, issue) => {
      const typed = String(value).replace(/\s/g, "").replace(/^R/i, "").replace(",", ".");
      if (!/^\d+(\.\d{1,2})?$/.test(typed)) {
        issue.addIssue({ code: "custom", message: `Give the ${label} in rands, like 1500.00.` });
        return z.NEVER;
      }
      const [whole = "0", cents = ""] = typed.split(".");
      return Number(whole) * 100 + Number(cents.padEnd(2, "0"));
    })
    .refine((cents) => cents <= LINE_MAX_CENTS, { error: `That ${label} is too large.` });

/** A Quote as the Artisan gives it, sending or revising. */
export const quoteFields = z
  .object({
    scope: z
      .string({ error: "Write the scope." })
      .trim()
      .min(1, { error: "Write the scope." })
      .max(SCOPE_MAX, { error: `Keep the scope to ${SCOPE_MAX} characters.` }),
    labour: rands("Labour").refine((cents) => cents > 0, { error: "Labour must be above zero." }),
    materials: rands("Materials"),
    materialsBy: z.enum(MATERIALS_BY, { error: "Say who supplies the materials." }),
    startOn: z
      .string({ error: "Give the start date." })
      .min(1, { error: "Give the start date." })
      .refine(isDay, { error: "Give the start date like 2026-11-30." }),
    durationDays: z.coerce
      .number<string | number>({ error: "Give the duration in whole days." })
      .int({ error: "Give the duration in whole days." })
      .min(1, { error: "The duration is at least 1 day." })
      .max(DURATION_MAX_DAYS, { error: `The duration is at most ${DURATION_MAX_DAYS} days.` }),
    warranty: z
      .string()
      .trim()
      .max(WARRANTY_MAX, { error: `Keep the Warranty to ${WARRANTY_MAX} characters.` })
      .nullish()
      .transform((warranty) => warranty || null),
  })
  .refine((quote) => quote.materialsBy !== "client" || quote.materials === 0, {
    error: "Materials are zero when the Client supplies them.",
    path: ["materials"],
  })
  .refine((quote) => quote.labour + quote.materials >= QUOTE_MIN_CENTS, {
    error: "A Quote totals at least R300.",
    path: ["labour"],
  });

export type QuoteFields = z.input<typeof quoteFields>;
export type ParsedQuote = z.output<typeof quoteFields>;
