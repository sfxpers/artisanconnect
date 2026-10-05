import * as z from "zod";
import { isDay } from "../sa-days";
import { SERVICE_CATEGORIES, type ServiceCategory } from "../service-categories";

// Shared with the web app's forms, so a check is refused the same way in both.
// Nothing here may import what only runs on the server.

// What an Artisan submits for Verification (#99, #118). Once: an identity
// document with a selfie holding it, a work permit if it is a foreign
// passport, and a Payout account. Per Service Category: three photos of their
// own work and any Credential the category needs. Optional: a police
// clearance and business insurance, which gate nothing.

export const CHECK_KINDS = [
  "identity",
  "work-permit",
  "payout-account",
  "work-photos",
  "trained-plumber",
  "gas-practitioner",
  "registered-person",
  "electrical-contractor",
  "police-clearance",
  "business-insurance",
] as const;

export type CheckKind = (typeof CHECK_KINDS)[number];

export type CheckGroup = "once" | "category" | "optional";

/** One part of what a check's files are, such as the document or the selfie. */
export type FilePart = {
  part: "document" | "selfie" | "photos";
  label: string;
  min: number;
  max: number;
  /** Only photos; otherwise photos or PDFs. */
  photosOnly: boolean;
};

type CheckDefinition = {
  name: string;
  group: CheckGroup;
  /** The category a Credential is for; work photos name theirs when sent. */
  category?: ServiceCategory;
  /** Whether it has an expiry date, after which it stops being current. */
  expiresOn: "required" | "optional" | "none";
  /** Whether it is shown with the day it was issued. */
  issuedOn: boolean;
  /** Whether it carries a registration number, which Completion evidence is read for. */
  registrationNumber: boolean;
  files: FilePart[];
  /** What to send, said for the Artisan. */
  hint: string;
};

const document = (label: string): FilePart => ({
  part: "document",
  label,
  min: 1,
  max: 3,
  photosOnly: false,
});

export const CHECKS: Record<CheckKind, CheckDefinition> = {
  identity: {
    name: "Identity document",
    group: "once",
    expiresOn: "optional",
    issuedOn: false,
    registrationNumber: false,
    files: [
      {
        part: "document",
        label: "The identity document (front, and back if it has one)",
        min: 1,
        max: 2,
        photosOnly: false,
      },
      { part: "selfie", label: "A selfie holding it", min: 1, max: 1, photosOnly: true },
    ],
    hint: "A South African ID, a refugee ID, or a passport, and a selfie of you holding it.",
  },
  "work-permit": {
    name: "Work permit",
    group: "once",
    expiresOn: "optional",
    issuedOn: false,
    registrationNumber: false,
    files: [document("The work permit")],
    hint: "Needed with a foreign passport: a permit that lets you work for yourself, such as permanent residence or an exemption permit. Give its expiry date unless it never expires.",
  },
  "payout-account": {
    name: "Payout account",
    group: "once",
    expiresOn: "none",
    issuedOn: false,
    registrationNumber: false,
    files: [document("A bank confirmation letter")],
    hint: "A letter from your bank confirming the account is in your own name. Payouts go here.",
  },
  "work-photos": {
    name: "Work photos",
    group: "category",
    expiresOn: "none",
    issuedOn: false,
    registrationNumber: false,
    files: [{ part: "photos", label: "Three photos", min: 3, max: 3, photosOnly: true }],
    hint: "Three photos of finished work you did yourself.",
  },
  "trained-plumber": {
    name: "Trained plumber",
    group: "category",
    category: "plumbing",
    expiresOn: "none",
    issuedOn: false,
    registrationNumber: false,
    files: [document("The trade test or certificate")],
    hint: "A trade test, a certificate of proficiency, or NQF 3 Construction Plumbing.",
  },
  "gas-practitioner": {
    name: "Gas practitioner registration",
    group: "category",
    category: "plumbing",
    expiresOn: "required",
    issuedOn: false,
    registrationNumber: true,
    files: [document("The SAQCC Gas registration")],
    hint: "Optional. A current SAQCC Gas registration lets you Quote on Jobs that install or remove gas.",
  },
  "registered-person": {
    name: "Registered person",
    group: "category",
    category: "electrical",
    expiresOn: "none",
    issuedOn: false,
    registrationNumber: true,
    files: [document("The registration certificate")],
    hint: "Your registration as an electrical tester, installation electrician, or master installation electrician, in your own name.",
  },
  "electrical-contractor": {
    name: "Electrical contractor registration",
    group: "category",
    category: "electrical",
    expiresOn: "required",
    issuedOn: false,
    registrationNumber: true,
    files: [document("The registration certificate")],
    hint: "Your current electrical contractor registration, in your own name. It is renewed yearly.",
  },
  "police-clearance": {
    name: "Police clearance",
    group: "optional",
    expiresOn: "none",
    issuedOn: true,
    registrationNumber: false,
    files: [document("The police clearance certificate")],
    hint: "Optional. Shown on your Profile with the day it was issued.",
  },
  "business-insurance": {
    name: "Business insurance",
    group: "optional",
    expiresOn: "required",
    issuedOn: false,
    registrationNumber: false,
    files: [document("The insurance certificate")],
    hint: "Optional. Shown on your Profile with its expiry date.",
  },
};

/** The Credentials each category needs, beyond work photos, and those it may add. */
export const CATEGORY_CREDENTIALS: Record<
  ServiceCategory,
  { required: CheckKind[]; gasWork?: CheckKind }
> = {
  plumbing: { required: ["trained-plumber"], gasWork: "gas-practitioner" },
  electrical: { required: ["registered-person", "electrical-contractor"] },
  carpentry: { required: [] },
  painting: { required: [] },
  tiling: { required: [] },
  brickwork: { required: [] },
  roofing: { required: [] },
  welding: { required: [] },
};

/** Where a check sits: one per kind, but work photos one per category. */
export function slotOf(kind: CheckKind, category: ServiceCategory | null): string {
  return kind === "work-photos" ? `work-photos:${category}` : kind;
}

export const DOCUMENT_TYPES = ["sa-id", "refugee-id", "passport"] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_NAMES: Record<DocumentType, string> = {
  "sa-id": "South African ID",
  "refugee-id": "Refugee ID",
  passport: "Passport",
};

/** South Africa, whose passport needs no work permit. */
export const SOUTH_AFRICA = "ZA";

// Fields

/** A field as typed: spaces and dashes are not part of a number. */
const compact = (value: string) => value.replace(/[\s-]/g, "").toUpperCase();

/** Whether a South African ID number passes its checksum (Luhn, over all 13 digits). */
export function passesIdChecksum(number: string): boolean {
  if (!/^\d{13}$/.test(number)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = Number(number[12 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** A text field, which a form leaves out if it was never touched. */
const text = (missing: string) => z.string({ error: missing }).default("");

const dayText = (label: string) =>
  text(`Give the ${label}.`)
    .pipe(z.string().trim())
    .refine((value) => value === "" || isDay(value), {
      error: `Give the ${label} as a date, like 2027-03-31.`,
    })
    .transform((value) => value || undefined);

const optionalDay = (label: string) => dayText(label).optional();
const requiredDay = (label: string) =>
  dayText(label).refine((value) => value !== undefined, { error: `Give the ${label}.` });

const registrationNumber = text("Give the registration number.").pipe(
  z
    .string()
    .trim()
    .min(1, { error: "Give the registration number." })
    .max(40, { error: "Keep the registration number to 40 characters." }),
);

/** A two-letter country code a passport may be issued by. */
export const passportCountry = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => passportCountries().includes(code), {
    error: "Choose the country that issued the passport.",
  });

/**
 * An Identity Number as the Artisan or the Admin gives it: a South African ID
 * number, which must pass its checksum, or a refugee ID or passport number
 * (with the passport's issuing country).
 */
export const identityNumber = z
  .object({
    documentType: z.enum(DOCUMENT_TYPES, { error: "Choose the kind of identity document." }),
    number: text("Give the document number.").transform(compact),
    country: z.string().optional(),
  })
  .superRefine((value, check) => {
    if (value.documentType === "sa-id") {
      if (!/^\d{13}$/.test(value.number)) {
        check.addIssue({
          code: "custom",
          path: ["number"],
          message: "A South African ID number has 13 digits.",
        });
      } else if (!passesIdChecksum(value.number)) {
        check.addIssue({
          code: "custom",
          path: ["number"],
          message: "This South African ID number is not valid. Check each digit.",
        });
      }
    } else if (!/^[A-Z0-9]{4,20}$/.test(value.number)) {
      check.addIssue({
        code: "custom",
        path: ["number"],
        message: "Give the document number: 4 to 20 letters and digits.",
      });
    }
    if (value.documentType === "passport" && !passportCountry.safeParse(value.country).success) {
      check.addIssue({
        code: "custom",
        path: ["country"],
        message: "Choose the country that issued the passport.",
      });
    }
  })
  .transform((value) => ({
    documentType: value.documentType,
    number: value.number,
    country: value.documentType === "passport" ? value.country!.trim().toUpperCase() : null,
  }));

export type IdentityNumber = z.output<typeof identityNumber>;

/** One Identity Number holds at most one Artisan Account, whoever's document it is on. */
export function identityKey(identity: IdentityNumber): string {
  return identity.documentType === "passport"
    ? `identity:passport:${identity.country}:${identity.number}`
    : `identity:id:${identity.number}`;
}

/** The Identity Number as the Admin reads it. */
export function formatIdentityNumber(identity: IdentityNumber): string {
  const type = DOCUMENT_TYPE_NAMES[identity.documentType];
  return identity.country
    ? `${type} ${identity.number} (${countryName(identity.country)})`
    : `${type} ${identity.number}`;
}

const payoutAccount = {
  accountHolder: text("Give the account holder's name, as the bank has it.").pipe(
    z
      .string()
      .trim()
      .min(1, { error: "Give the account holder's name, as the bank has it." })
      .max(80, { error: "Keep the account holder's name to 80 characters." }),
  ),
  bank: text("Give the bank's name.").pipe(
    z
      .string()
      .trim()
      .min(1, { error: "Give the bank's name." })
      .max(60, { error: "Keep the bank's name to 60 characters." }),
  ),
  branchCode: text("Give the branch code.")
    .transform(compact)
    .pipe(z.string().regex(/^\d{6}$/, { error: "A branch code has 6 digits." })),
  accountNumber: text("Give the account number.")
    .transform(compact)
    .pipe(z.string().regex(/^\d{6,16}$/, { error: "An account number has 6 to 16 digits." })),
};

/** No two Artisans may hold one Payout account. */
export function payoutAccountKey(accountNumber: string): string {
  return `payout:${accountNumber}`;
}

const category = z.enum(SERVICE_CATEGORIES, { error: "Choose the Service Category." });

/** What an Artisan types for each kind of check; the files come beside it. */
export const checkDetails = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("identity"),
    documentType: z.enum(DOCUMENT_TYPES, { error: "Choose the kind of identity document." }),
    number: text("Give the document number."),
    country: z.string().optional(),
    expiresOn: optionalDay("expiry date"),
  }),
  z.object({ kind: z.literal("work-permit"), expiresOn: optionalDay("expiry date") }),
  z.object({ kind: z.literal("payout-account"), ...payoutAccount }),
  z.object({ kind: z.literal("work-photos"), category }),
  z.object({ kind: z.literal("trained-plumber") }),
  z.object({
    kind: z.literal("gas-practitioner"),
    registrationNumber,
    expiresOn: requiredDay("expiry date"),
  }),
  z.object({ kind: z.literal("registered-person"), registrationNumber }),
  z.object({
    kind: z.literal("electrical-contractor"),
    registrationNumber,
    expiresOn: requiredDay("expiry date"),
  }),
  z.object({ kind: z.literal("police-clearance"), issuedOn: requiredDay("issue date") }),
  z.object({ kind: z.literal("business-insurance"), expiresOn: requiredDay("expiry date") }),
]);

export type CheckDetailsInput = z.input<typeof checkDetails>;

// Countries

const NOT_COUNTRIES = new Set(["EU", "EZ", "QO", "UN", "XA", "XB", "ZZ"]);

let countries: string[] | undefined;

/** Every country a passport may be issued by, by its two-letter code. */
export function passportCountries(): string[] {
  if (countries) return countries;
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const found: string[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (!NOT_COUNTRIES.has(code) && names.of(code)) found.push(code);
    }
  }
  return (countries = found);
}

export function countryName(code: string): string {
  return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
}
