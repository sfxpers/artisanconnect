import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { accountIdOf, type Actor } from "./actor";
import type { Context, Write } from "./context";
import { accounts, authUsers, notices } from "./schema";
import { defineSection } from "./section";

/**
 * A Tell: an in-app notice plus one email naming the event and linking back,
 * with no message text. It goes to the Account whose action the event needs,
 * or whose money, Job, or standing it changes, never to the actor. "Told"
 * means the notice was written, so commit a Tell with its event and then call
 * `emailTells`; the every-minute run retries an email that did not go.
 */
export type Tell = {
  /** What happened, by kind, such as "marketplace-rules-changed". */
  event: string;
  /** Names the event for the person, in the notice and as the email's subject. */
  title: string;
  /** The page it is about, as a path in the web app. */
  link: string;
};

/** The writes that tell these Accounts, leaving out the actor. */
export function tell(ctx: Context, actor: Actor, to: string[], told: Tell): Write[] {
  const actorId = accountIdOf(actor);
  const toldAt = ctx.now();
  return [...new Set(to)]
    .filter((accountId) => accountId !== actorId)
    .map((accountId) =>
      ctx.db.insert(notices).values({ id: ctx.newId(), accountId, toldAt, ...told }),
    );
}

/** The write that tells every Account (never a sign-up whose Email is unproven). */
export function tellEveryAccount(ctx: Context, told: Tell): Write {
  return ctx.db.insert(notices).select(
    ctx.db
      .select({
        id: sql<string>`lower(hex(randomblob(16)))`.as("id"),
        accountId: accounts.id,
        event: sql<string>`${told.event}`.as("event"),
        title: sql<string>`${told.title}`.as("title"),
        link: sql<string>`${told.link}`.as("link"),
        toldAt: sql<number>`${ctx.now().getTime()}`.as("told_at"),
        emailedAt: sql<null>`null`.as("emailed_at"),
      })
      .from(accounts)
      .innerJoin(authUsers, eq(authUsers.id, accounts.id))
      .where(eq(authUsers.emailVerified, true)),
  );
}

/**
 * Sends the one email of every Tell whose email has not gone. Each is claimed
 * before it is sent, so two runs never send one twice; a send that fails is
 * released for the next run. A Worker that dies mid-send loses that email,
 * never the notice: one email at most, never two.
 */
export async function emailTells(ctx: Context): Promise<void> {
  const unsent = await ctx.db
    .select({ id: notices.id, title: notices.title, link: notices.link, to: authUsers.email })
    .from(notices)
    .innerJoin(authUsers, eq(authUsers.id, notices.accountId))
    .where(isNull(notices.emailedAt))
    .orderBy(asc(notices.toldAt))
    .limit(200);
  for (const notice of unsent) {
    const claimed = await ctx.db
      .update(notices)
      .set({ emailedAt: ctx.now() })
      .where(and(eq(notices.id, notice.id), isNull(notices.emailedAt)))
      .returning({ id: notices.id });
    if (claimed.length === 0) continue;
    try {
      await ctx.ports.mailer.send({
        to: notice.to,
        subject: notice.title,
        text: `${notice.title}.\n\nSee it on ArtisanConnect: ${new URL(notice.link, ctx.config.appUrl).href}`,
      });
    } catch (error) {
      console.error(`The email of notice ${notice.id} did not go`, error);
      await ctx.db.update(notices).set({ emailedAt: null }).where(eq(notices.id, notice.id));
    }
  }
}

export const noticesSection = defineSection({
  name: "notices",
  api: (ctx) => ({
    /** The viewer's Notices stream, newest first. */
    async list(viewer: Actor) {
      const accountId = accountIdOf(viewer);
      if (!accountId) return [];
      return ctx.db
        .select({
          id: notices.id,
          event: notices.event,
          title: notices.title,
          link: notices.link,
          toldAt: notices.toldAt,
        })
        .from(notices)
        .where(eq(notices.accountId, accountId))
        .orderBy(desc(notices.toldAt), desc(notices.id));
    },
  }),
});
