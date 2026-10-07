import * as z from "zod";
import { rands } from "../quotes/inputs";
import type { ServiceCategory } from "../service-categories";

// What a Completion, a Fix request, and a Refund take, shared with the web app's forms.
// Nothing here may import what only runs on the server.

/** The most characters a Completion's note or a Fix request's note may have. */
export const NOTE_MAX = 2000;

/** The most after-work photos a Completion may hold. */
export const COMPLETION_PHOTOS_MAX = 10;

/** The most documents a Completion may hold, its certificate among them. */
export const COMPLETION_DOCUMENTS_MAX = 5;

/** The certificates the law requires before the work is handed over (Completion evidence). */
export type CertificateKind = "compliance" | "conformity";

export const CERTIFICATES: Record<
  CertificateKind,
  {
    /** As it is written on the certificate, and said to people. */
    name: string;
    /** The Jobs that need it, said for the Artisan. */
    neededOn: string;
  }
> = {
  compliance: { name: "certificate of compliance", neededOn: "an Electrical Job" },
  conformity: {
    name: "certificate of conformity",
    neededOn: "a Plumbing Job that installs or removes gas",
  },
};

/** The certificate a Job's Completion needs: on Electrical work, and on Plumbing that installs or removes gas. */
export function certificateNeeded(job: {
  category: ServiceCategory | null;
  gasWork: boolean | null;
}): CertificateKind | null {
  if (job.category === "electrical") return "compliance";
  if (job.category === "plumbing" && job.gasWork) return "conformity";
  return null;
}

/**
 * A Refund as the Artisan names it: an amount of each unreleased line, in
 * rands, left out or empty for none, and above zero in all.
 */
export const refundFields = z
  .object({
    materials: line("Materials"),
    labour: line("Labour"),
  })
  .transform(({ materials = 0, labour = 0 }) => ({ materials, labour }))
  .refine(({ materials, labour }) => materials + labour > 0, {
    error: "Name an amount to refund.",
  });

export type RefundFields = z.input<typeof refundFields>;

/** One line of a Refund: rands, or nothing for none. */
function line(label: string) {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    rands(label).optional(),
  );
}
