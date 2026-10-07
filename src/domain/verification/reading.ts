import { checkContent, readFiles } from "../content/check";
import type { Context } from "../context";
import type { BankAccountVerification, VerifyBankAccount } from "../ports";
import { ok, type Result } from "../result";
import { CHECKS, type CheckKind } from "./checks";
import type { CheckDetails, CheckFile, Reading } from "./stored";

// The automatic reading of a check, which the Admin sees beside the document
// (#118): the text read from its files and what was found in it, the payment
// adapter's check of a Payout account, and, for work photos, which the
// Profile will show to anyone, the Content check. The Admin decides; the
// reading is evidence, never a decision.

/** How much of the text read is kept for the Admin. */
const TEXT_MAX = 4000;

type ToRead = {
  kind: CheckKind;
  details: CheckDetails;
  files: CheckFile[];
  /** The Artisan's name, as it signed up. */
  name: string;
  /** The Artisan's Identity Number, current or waiting, which the bank check needs. */
  identityNumber: string | null;
};

/**
 * Reads a check's files. Work photos with a sure hit of the Content check are
 * refused, as anything sent is; every other check is read and kept.
 */
export async function readCheck(ctx: Context, check: ToRead): Promise<Result<Reading, "content">> {
  if (check.kind === "work-photos") {
    const checked = await checkContent(ctx, {
      text: "",
      files: check.files,
      context: { kind: "before-payment" },
    });
    if (!checked.ok) return checked;
    const verdict = checked.value;
    return ok({
      facts: [
        {
          label: "Content check",
          value: verdict.verdict === "clear" ? "Clear" : `Unsure: ${verdict.reason}`,
        },
      ],
      text: verdict.text.slice(0, TEXT_MAX),
    });
  }

  const read = await readFiles(ctx, check.files);
  const text = read.texts.filter((part) => part.trim()).join("\n\n");
  const facts: Reading["facts"] = [];
  if (read.unread) facts.push({ label: "Could not read", value: read.unread });
  facts.push({ label: "Name in the text", value: nameFound(check.name, text) });
  const { details } = check;
  if (check.kind === "identity" && details.number) {
    facts.push({ label: "Number in the text", value: found(details.number, text) });
  }
  if (CHECKS[check.kind].registrationNumber && details.registrationNumber) {
    facts.push({
      label: "Registration number in the text",
      value: found(details.registrationNumber, text),
    });
  }
  let bank: BankAccountVerification | undefined;
  if (check.kind === "payout-account" && details.accountNumber) {
    facts.push({ label: "Account number in the text", value: found(details.accountNumber, text) });
    bank = await checkBankAccount(ctx, check);
  }
  return ok({ facts, text: text.slice(0, TEXT_MAX), ...(bank ? { bank } : {}) });
}

/**
 * Asks the payment adapter whether the account is open and the Artisan's. It
 * may stay pending for up to 120 seconds; the Admin's page asks again.
 */
export async function checkBankAccount(
  ctx: Context,
  check: Pick<ToRead, "details" | "name" | "identityNumber">,
): Promise<BankAccountVerification | undefined> {
  const { accountHolder, accountNumber, branchCode } = check.details;
  if (!check.identityNumber || !accountHolder || !accountNumber || !branchCode) return undefined;
  const words = check.name.trim().split(/\s+/);
  const request: VerifyBankAccount = {
    accountHolder,
    accountNumber,
    branchCode,
    identityNumber: check.identityNumber,
    surname: words.at(-1) ?? "",
    initials: words
      .slice(0, -1)
      .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
      .join(""),
  };
  try {
    return await ctx.ports.payments.verifyBankAccount(request);
  } catch (error) {
    console.error("The bank account check did not run", error);
    return undefined;
  }
}

/** The bank check, said for the Admin. */
export function bankFacts(bank: BankAccountVerification | undefined): Reading["facts"] {
  if (!bank) return [{ label: "Bank check", value: "Not run" }];
  if (bank.state === "pending") return [{ label: "Bank check", value: "Waiting for the bank" }];
  const yes = (value: boolean) => (value ? "Yes" : "No");
  return [
    { label: "Account open", value: yes(bank.accountOpen) },
    { label: "Takes payments in", value: yes(bank.acceptsCredits) },
    { label: "Identity Number matches", value: yes(bank.identityMatch) },
    { label: "Surname matches", value: yes(bank.surnameMatch) },
    { label: "Initials match", value: yes(bank.initialsMatch) },
  ];
}

/** Letters and digits only, in one case, so "800101 5009 087" finds "8001015009087". */
function squeeze(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toUpperCase();
}

/** Whether the value is in the text, said for the Admin: "Yes", "No", or "Nothing read". */
export function found(value: string, text: string): string {
  if (!text.trim()) return "Nothing read";
  return squeeze(text).includes(squeeze(value)) ? "Yes" : "No";
}

/** Whether every word of the Artisan's name is in the text. */
function nameFound(name: string, text: string): string {
  if (!text.trim()) return "Nothing read";
  const words = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1);
  const inText = new Set(words(text));
  const wanted = words(name);
  const hits = wanted.filter((word) => inText.has(word)).length;
  if (hits === 0) return "No";
  return hits === wanted.length ? "Yes" : "Partly";
}
