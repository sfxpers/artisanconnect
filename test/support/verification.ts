import type { AdminActor } from "@/domain/actor";
import type { Domain } from "@/domain";
import { passesIdChecksum, type CheckDetailsInput } from "@/domain/verification/checks";
import { cameraJpeg } from "./files";
import { textPdf } from "./pdfs";

// What an Artisan sends for Verification, as their device would send it.

/** A valid South African ID number (it passes its checksum). */
export const SA_ID = "8001015009087";

/** A different valid South African ID number for each seed. */
export function saIdNumber(seed: number): string {
  const body = `800101${String(seed % 10000).padStart(4, "0")}08`;
  for (let check = 0; check < 10; check++) {
    if (passesIdChecksum(`${body}${check}`)) return `${body}${check}`;
  }
  throw new Error("unreachable");
}

export async function photo(): Promise<Blob> {
  return new Blob([await cameraJpeg(64, 48)], { type: "image/jpeg" });
}

export async function letter(lines: string[] = ["Sipho Dlamini"]): Promise<Blob> {
  return new Blob([await textPdf({ lines })], { type: "application/pdf" });
}

export type Submission = {
  details: CheckDetailsInput;
  files: { document?: Blob[]; selfie?: Blob[]; photos?: Blob[] };
};

export async function identity(
  details: Partial<Extract<CheckDetailsInput, { kind: "identity" }>> = {},
): Promise<Submission> {
  return {
    details: { kind: "identity", documentType: "sa-id", number: SA_ID, ...details },
    files: { document: [await photo()], selfie: [await photo()] },
  };
}

export async function payoutAccount(
  details: Partial<Extract<CheckDetailsInput, { kind: "payout-account" }>> = {},
): Promise<Submission> {
  return {
    details: {
      kind: "payout-account",
      accountHolder: "S Dlamini",
      bank: "Capitec",
      branchCode: "470010",
      accountNumber: "1234567890",
      ...details,
    },
    files: { document: [await letter(["Sipho Dlamini", "Account 1234567890"])] },
  };
}

export async function workPhotos(
  category: Extract<CheckDetailsInput, { kind: "work-photos" }>["category"],
): Promise<Submission> {
  return {
    details: { kind: "work-photos", category },
    files: { photos: [await photo(), await photo(), await photo()] },
  };
}

/** A check sent as one document, with whatever details its kind takes. */
export async function document(details: CheckDetailsInput): Promise<Submission> {
  return { details, files: { document: [await letter()] } };
}

/** Submits a check that must not be refused, and gives its id. */
export async function submit(
  domain: Domain,
  artisan: { actor: Parameters<Domain["verification"]["submit"]>[0] },
  submission: Submission | Promise<Submission>,
): Promise<string> {
  const sent = await domain.verification.submit(artisan.actor, await submission);
  if (!sent.ok) throw new Error(sent.refusal.message);
  return sent.value.checkId;
}

/** The Artisan's open Verification item, as the Admin finds it on the home stream. */
export async function verificationItem(domain: Domain, admin: { actor: AdminActor }) {
  const home = await domain.queues.home(admin.actor, { queue: "verification" });
  const [item, ...more] = home?.items ?? [];
  if (!item || more.length > 0) throw new Error("Expected one Verification item waiting");
  return item;
}

/** The Admin's decision on one check, on its row of a Verification item. */
export function decideCheck(
  domain: Domain,
  admin: { actor: AdminActor },
  at: { itemId: string; checkId: string },
  decision: "accept" | "reject" | "remove",
  extra: { reason?: string; fields?: Record<string, string> } = {},
) {
  return domain.queues.decideRow(admin.actor, {
    itemId: at.itemId,
    rowId: at.checkId,
    decision,
    ...extra,
  });
}
