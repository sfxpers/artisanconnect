// Our ids as a bank statement shows them: the payment adapter takes our id as
// the reference, shortened to what the bank's field holds.

/** The first hex digits of our id, in capitals. */
export function shortId(id: string, digits = 8): string {
  return id.replaceAll("-", "").slice(0, digits).toUpperCase();
}

/**
 * Our id on a bank statement: "AC" and its first hex digits. Eight fit the
 * payer's 12 characters (a Payment, a Refund); sixteen the beneficiary's 20
 * (a Payout).
 */
export function bankReference(id: string, digits: 8 | 16 = 8): string {
  return `AC ${shortId(id, digits)}`;
}
