import { and, asc, eq, gt, lte } from "drizzle-orm";
import type { Context } from "./context";
import { rateLimitHits } from "./schema";

/** At most `max` tries per `seconds` for one key, such as an IP or an Email. */
export type Limit = { key: string; max: number; seconds: number };

/**
 * Counts one try against every limit, unless one is already used up. Returns
 * how long to wait when one is, and counts nothing then.
 */
export async function tryWithin(
  ctx: Context,
  limits: Limit[],
): Promise<{ ok: true } | { ok: false; waitSeconds: number }> {
  const now = ctx.now().getTime();
  let waitSeconds = 0;
  for (const limit of limits) {
    const since = new Date(now - limit.seconds * 1000);
    const hits = await ctx.db
      .select({ at: rateLimitHits.at })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.key, limit.key), gt(rateLimitHits.at, since)))
      .orderBy(asc(rateLimitHits.at));
    if (hits.length >= limit.max) {
      const oldest = hits[hits.length - limit.max]!.at.getTime();
      waitSeconds = Math.max(waitSeconds, Math.ceil((oldest + limit.seconds * 1000 - now) / 1000));
    }
  }
  if (waitSeconds > 0) return { ok: false, waitSeconds };
  await ctx.commit(
    limits.flatMap((limit) => [
      ctx.db
        .delete(rateLimitHits)
        .where(
          and(
            eq(rateLimitHits.key, limit.key),
            lte(rateLimitHits.at, new Date(now - limit.seconds * 1000)),
          ),
        ),
      ctx.db.insert(rateLimitHits).values({ id: ctx.newId(), key: limit.key, at: new Date(now) }),
    ]),
  );
  return { ok: true };
}
