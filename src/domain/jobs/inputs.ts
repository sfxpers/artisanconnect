// Shared with the web app's form, so a Job is refused the same way in both.
// Nothing here may import what only runs on the server.

import * as z from "zod";
import { isDay } from "../sa-days";
import { SERVICE_CATEGORIES } from "../service-categories";

/** A label on a Job that changes no rule. */
export const SITE_TYPES = ["home", "business"] as const;
export type SiteType = (typeof SITE_TYPES)[number];

/** "Find Artisans for me", or "Only Artisans I invite" (an Invite-only Job). */
export const MATCHINGS = ["matched", "invite-only"] as const;
export type Matching = (typeof MATCHINGS)[number];

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 2000;
export const STREET_MAX = 200;
/** A posted Job has 1 to this many photos. */
export const JOB_PHOTOS_MAX = 10;

/** How long a Job is Open without a Hire, from posting or Renew. */
export const OPEN_DAYS = 14;

const text = (label: string, max: number) =>
  z
    .string({ error: `Write the ${label}.` })
    .trim()
    .max(max, { error: `Keep the ${label} to ${max} characters.` });

/**
 * A Draft as the Client gives it. Anything may be left out, but what is
 * given must be one of the choices.
 */
export const draftFields = z.object({
  category: z.enum(SERVICE_CATEGORIES, { error: "Choose a Service Category." }).nullish(),
  siteType: z.enum(SITE_TYPES, { error: "Choose Home or Business." }).nullish(),
  suburbId: z.string().nullish(),
  street: text("street address", STREET_MAX).default(""),
  title: text("title", TITLE_MAX).default(""),
  description: text("description", DESCRIPTION_MAX).default(""),
  gasWork: z.boolean().nullish(),
  preferredStart: z
    .string()
    .nullish()
    .transform((day) => day || null)
    .refine((day) => day === null || isDay(day), { error: "Give the date like 2026-11-30." }),
  matching: z
    .enum(MATCHINGS, { error: 'Choose "Find Artisans for me" or "Only Artisans I invite".' })
    .nullish(),
});

export type DraftFields = z.input<typeof draftFields>;

/** What a Client may change on a posted Job until its first Quote. */
export const editFields = z.object({
  title: text("title", TITLE_MAX),
  description: text("description", DESCRIPTION_MAX),
  siteType: z.enum(SITE_TYPES, { error: "Choose Home or Business." }),
  preferredStart: draftFields.shape.preferredStart,
});

export type EditFields = z.input<typeof editFields>;
