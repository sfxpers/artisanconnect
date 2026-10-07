import type { ServiceCategory } from "../service-categories";

// What a Completion and a Fix request take, shared with the web app's forms.
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
