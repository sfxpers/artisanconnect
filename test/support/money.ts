import type { Actor } from "@/domain/actor";
import type { Harness } from "./harness";

/**
 * The Releases to the Artisan, oldest first, as its Payouts view shows each:
 * the part released, the Artisan Fee kept, and what it owes the Artisan.
 */
export async function releasesTo(domain: Harness["domain"], artisan: { actor: Actor }) {
  const releases = (await domain.payouts.mine(artisan.actor))?.releases ?? [];
  return [...releases].reverse().map(({ part, releasedCents, artisanFeeCents, amountCents }) => ({
    part,
    releasedCents,
    artisanFeeCents,
    amountCents,
  }));
}
