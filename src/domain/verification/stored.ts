import type { BankAccountVerification } from "../ports";
import type { StoredFile } from "../uploads";
import type { DocumentType, FilePart } from "./checks";

// What a Verification check row holds beside its columns.

/** What the Artisan typed, as corrected by the Admin on accepting it. */
export type CheckDetails = {
  documentType?: DocumentType;
  number?: string;
  country?: string | null;
  accountHolder?: string;
  bank?: string;
  branchCode?: string;
  accountNumber?: string;
  registrationNumber?: string;
};

/** A file of the check, and which part of it it is: the document, the selfie, a photo. */
export type CheckFile = StoredFile & { part: FilePart["part"] };

/** The automatic reading of a check, shown to the Admin beside the document. */
export type Reading = {
  /** What was found, such as whether the number is in the document's text. */
  facts: { label: string; value: string }[];
  /** Every word read from the files. It is the document's, so it opens on a logged click. */
  text: string;
  /** The payment adapter's check of a Payout account, which may stay pending a while. */
  bank?: BankAccountVerification;
};
