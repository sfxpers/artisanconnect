import type { verificationChecks } from "../schema";
import { SERVICE_CATEGORIES, type ServiceCategory } from "../service-categories";
import { CATEGORY_CREDENTIALS, CHECKS, SOUTH_AFRICA, slotOf, type CheckKind } from "./checks";

// Where an Artisan's Verification stands, derived from its checks and today's
// South African calendar day. Nothing here is stored: a check stops being
// current on its expiry date without anything being written.

export type CheckRow = typeof verificationChecks.$inferSelect;

/**
 * An accepted check whose expiry date (if it has one) has not come, and, for
 * a Payout account, that no bank has refused or sent back a Payout to.
 */
export function isCurrent(check: CheckRow, today: string): boolean {
  return (
    check.state === "accepted" &&
    (!check.expiresOn || today < check.expiresOn) &&
    !check.payoutsStoppedAt
  );
}

/** Each slot's checks, newest first. */
export class Standing {
  readonly #bySlot = new Map<string, CheckRow[]>();

  constructor(
    checks: CheckRow[],
    readonly today: string,
  ) {
    const newestFirst = [...checks].sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime() || b.id.localeCompare(a.id),
    );
    for (const check of newestFirst) {
      const list = this.#bySlot.get(check.slot) ?? [];
      list.push(check);
      this.#bySlot.set(check.slot, list);
    }
  }

  checks(slot: string): CheckRow[] {
    return this.#bySlot.get(slot) ?? [];
  }

  /** The slot's accepted check, current or expired; superseded and removed ones are not. */
  accepted(slot: string): CheckRow | null {
    return this.checks(slot).find((check) => check.state === "accepted") ?? null;
  }

  current(slot: string): CheckRow | null {
    const accepted = this.accepted(slot);
    return accepted && isCurrent(accepted, this.today) ? accepted : null;
  }

  waiting(slot: string): CheckRow | null {
    return this.checks(slot).find((check) => check.state === "submitted") ?? null;
  }

  /** Whether the current identity document is a foreign passport, so a work permit gates. */
  needsWorkPermit(): boolean {
    return isForeignPassport(this.current("identity"));
  }

  /**
   * Whether a work permit may be sent: the current identity document, or one
   * waiting to replace it, is a foreign passport.
   */
  takesWorkPermit(): boolean {
    return this.needsWorkPermit() || isForeignPassport(this.waiting("identity"));
  }

  /**
   * Every check needed once is current: identity and any work permit, and a
   * Payout account accepted. One a bank stopped still counts: it proved an
   * account in the Artisan's own name, and only their Payouts wait for a
   * current one (#129).
   */
  onceChecksCurrent(): boolean {
    const payoutAccount = this.accepted("payout-account");
    return (
      this.current("identity") !== null &&
      payoutAccount !== null &&
      isCurrent({ ...payoutAccount, payoutsStoppedAt: null }, this.today) &&
      (!this.needsWorkPermit() || this.current("work-permit") !== null)
    );
  }

  /** Verified for a category now, and for gas work within it. */
  verifiedFor(category: ServiceCategory): { verified: boolean; gasWork: boolean } {
    const credentials = CATEGORY_CREDENTIALS[category];
    const verified =
      this.onceChecksCurrent() &&
      this.current(slotOf("work-photos", category)) !== null &&
      credentials.required.every((kind) => this.current(slotOf(kind, null)) !== null);
    const gasWork =
      verified && !!credentials.gasWork && this.current(slotOf(credentials.gasWork, null)) !== null;
    return { verified, gasWork };
  }

  verifiedCategories(): { category: ServiceCategory; gasWork: boolean }[] {
    return SERVICE_CATEGORIES.flatMap((category) => {
      const { verified, gasWork } = this.verifiedFor(category);
      return verified ? [{ category, gasWork }] : [];
    });
  }
}

function isForeignPassport(identity: CheckRow | null): boolean {
  return identity?.details.documentType === "passport" && identity.details.country !== SOUTH_AFRICA;
}

/** Every slot, in the order the Artisan and the Admin see them: once, per category, optional. */
export function allSlots(): { slot: string; kind: CheckKind; category: ServiceCategory | null }[] {
  const once = (["identity", "work-permit", "payout-account"] as const).map((kind) => ({
    slot: slotOf(kind, null),
    kind,
    category: null,
  }));
  const perCategory = SERVICE_CATEGORIES.flatMap((category) => {
    const { required, gasWork } = CATEGORY_CREDENTIALS[category];
    const kinds: CheckKind[] = ["work-photos", ...required, ...(gasWork ? [gasWork] : [])];
    return kinds.map((kind) => ({ slot: slotOf(kind, category), kind, category }));
  });
  const optional = (["police-clearance", "business-insurance"] as const).map((kind) => ({
    slot: slotOf(kind, null),
    kind,
    category: null,
  }));
  return [...once, ...perCategory, ...optional];
}

/** A check's name with its category where it has one: "Work photos, Plumbing". */
export function checkTitle(kind: CheckKind, categoryName: string | null): string {
  return kind === "work-photos" && categoryName
    ? `${CHECKS[kind].name}, ${categoryName}`
    : CHECKS[kind].name;
}
