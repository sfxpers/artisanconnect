import { createDomain, type DomainConfig } from "@/domain";
import type { Clock } from "@/domain/ports";
import type { AdminActor } from "@/domain/shared/actor";
import { createFakeContentReader } from "../../test/support/fakes/content-reader";
import { createFakeMailer } from "../../test/support/fakes/mailer";
import { saDay } from "@/domain/shared/sa-days";
import { configFromEnv, fakePaymentsFromEnv, portsFromEnv } from "@/worker/ports";
import { webmOpus } from "../../test/support/files";
import { given } from "../../test/support/given";
import { pagesOf, textPdf } from "../../test/support/pdfs";

// What a smoke test needs in the local app's D1, made by the domain tests'
// own builders through the module's commands. The Content check passes
// everything (the local app cannot reach Workers AI), and Email codes are
// read from a fake mailer, so nothing is sent.

/** A Client with an Invite-only Job and one Sent Quote on it, from a verified Artisan. */
export async function hire(env: Env) {
  const { domain, make } = await world(env);
  const { client, artisan, jobId, quoteId } = await quoted(domain, make);
  return {
    email: client.email,
    password: client.password,
    jobId,
    quoteId,
    artisan: { email: artisan.email, password: artisan.password },
  };
}

/** A Client's Invite-only Job with two Sent Quotes: R2 000 from Sipho Dlamini, then R900 from Themba Nkosi. */
export async function quotedTwice(env: Env) {
  const { domain, make } = await world(env);
  const stamp = Date.now();
  const client = await make.client({ email: `client-${stamp}@example.test` });
  const jobId = await make.openJob(client, { matching: "invite-only" });
  for (const [name, labour, materials] of [
    ["Sipho Dlamini", "1500", "500"],
    ["Themba Nkosi", "600", "300"],
  ] as const) {
    const artisan = await make.matchableArtisan({
      name,
      email: `${name.split(" ")[0]!.toLowerCase()}-${stamp}@example.test`,
    });
    const invited = await domain.invitations.invite(client.actor, {
      jobId,
      artisanId: artisan.actor.accountId,
    });
    if (!invited.ok) throw new Error(invited.refusal.message);
    await make.sentQuote(artisan, jobId, { labour, materials });
  }
  return { email: client.email, password: client.password, jobId };
}

/** A Client's Job Hired from a Quote with Materials, through the local app's fake checkout: Paid. */
export async function hired(env: Env) {
  const { domain, make } = await world(env);
  const { client, artisan, jobId, quoteId } = await quoted(domain, make);
  await make.hired(client, quoteId);
  return {
    email: client.email,
    password: client.password,
    jobId,
    engagementId: await make.engagementOf(client, jobId),
    artisan: { email: artisan.email, password: artisan.password },
  };
}

/**
 * The Hired Artisan of an Engagement marks the work complete, with a note and
 * a photo the Content check passes (#130). Work must have started.
 */
export async function markedComplete(env: Env, engagementId: string) {
  const { make } = await world(env);
  const engagement = await env.DB.prepare("select artisan_id from engagements where id = ?")
    .bind(engagementId)
    .first<{ artisan_id: string }>();
  if (!engagement) throw new Error(`No Engagement ${engagementId}`);
  await make.markedComplete(
    { actor: { kind: "artisan", accountId: engagement.artisan_id } },
    engagementId,
    { note: "Both walls have two coats, and the room is cleaned." },
  );
  return { engagementId };
}

/**
 * The Hired Artisan of an Engagement writes in its Conversation (#131): a
 * phone number, a voice note, and a PDF, which only the Engagement's takes.
 */
export async function engagementMessage(env: Env, engagementId: string) {
  const { domain } = await world(env);
  const row = await env.DB.prepare(
    `select c.id as conversation_id, e.artisan_id from engagements e
     join conversations c on c.job_id = e.job_id and c.artisan_id = e.artisan_id
     where e.id = ?`,
  )
    .bind(engagementId)
    .first<{ conversation_id: string; artisan_id: string }>();
  if (!row) throw new Error(`No Engagement ${engagementId}`);
  const sent = await domain.conversations.send(
    { kind: "artisan", accountId: row.artisan_id },
    {
      conversationId: row.conversation_id,
      text: "Call me on 082 555 1234 when you're home. The colour chart is attached.",
      files: [new Blob([webmOpus(12)]), new Blob([await textPdf({ lines: ["Colour chart"] })])],
    },
  );
  if (!sent.ok) throw new Error(sent.refusal.message);
  return { conversationId: row.conversation_id };
}

/** The Email of an Admin of the local app, set up first if there is none, to sign in with a code. */
export async function admin(env: Env) {
  const { domain } = await world(env);
  const { actor } = await anAdmin(env, domain);
  const row = await env.DB.prepare("select email from admins where id = ?")
    .bind(actor.adminId)
    .first<{ email: string }>();
  return { email: row!.email };
}

/** The Admin's queue item of the Engagement's Dispute (#135). */
export async function disputeItem(env: Env, engagementId: string) {
  const row = await env.DB.prepare(
    "select queue_items.id from queue_items join disputes on disputes.id = queue_items.subject_id where queue_items.kind = 'dispute' and disputes.engagement_id = ?",
  )
    .bind(engagementId)
    .first<{ id: string }>();
  if (!row) throw new Error(`No Dispute item for Engagement ${engagementId}`);
  return { itemId: row.id };
}

/**
 * The open Signal item of what the Client and Artisan of a Hired Job share
 * (#140): a device, an IP, or a Payout-account name.
 */
export async function sharedSignalItem(env: Env, jobId: string) {
  const row = await env.DB.prepare(
    "select signals.queue_item_id as id from signals join engagements on engagements.client_id = signals.account_id and engagements.artisan_id = signals.other_account_id join queue_items on queue_items.id = signals.queue_item_id where signals.kind = 'shared' and engagements.job_id = ? and queue_items.decided_at is null",
  )
    .bind(jobId)
    .first<{ id: string }>();
  if (!row) throw new Error(`No open Signal of what the parties to Job ${jobId} share`);
  return { itemId: row.id };
}

/** The module on the local app's D1, and the builders over it. */
async function world(env: Env, config: Partial<DomainConfig> = {}, clock?: Clock) {
  const mailer = createFakeMailer();
  const ports = portsFromEnv(env);
  const domain = createDomain(
    {
      ...ports,
      clock: clock ?? ports.clock,
      contentReader: createFakeContentReader(pagesOf),
      mailer,
    },
    { ...configFromEnv(env), ...config },
  );
  const make = given({
    domain,
    mailer,
    // The local app's own fake, so a Payment arrives as its checkout page would make it.
    payments: fakePaymentsFromEnv(env),
    admin: await anAdmin(env, domain),
    // New Identity Numbers and Payout accounts each run.
    start: Math.floor(Math.random() * 3_000_000),
  });
  return { domain, make };
}

/** An Invite-only Job with one Sent Quote on it, starting in 30 days, from a verified Artisan. */
async function quoted(
  domain: ReturnType<typeof createDomain>,
  make: Awaited<ReturnType<typeof world>>["make"],
) {
  const stamp = Date.now();
  const client = await make.client({ email: `client-${stamp}@example.test` });
  const artisan = await make.matchableArtisan({ email: `artisan-${stamp}@example.test` });
  const jobId = await make.openJob(client, { matching: "invite-only" });
  const invited = await domain.invitations.invite(client.actor, {
    jobId,
    artisanId: artisan.actor.accountId,
  });
  if (!invited.ok) throw new Error(invited.refusal.message);
  const quoteId = await make.sentQuote(artisan, jobId, {
    startOn: saDay(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
  });
  return { client, artisan, jobId, quoteId };
}

/** An Admin of the local app, set up first if there is none. */
async function anAdmin(env: Env, domain: ReturnType<typeof createDomain>) {
  const current = () =>
    env.DB.prepare("select id from admins where removed_at is null limit 1").first<{
      id: string;
    }>();
  let admin = await current();
  if (!admin) {
    const setUp = await domain.system.setUpFirstAdmin({ email: "admin@example.test" });
    if (!setUp.ok) throw new Error(setUp.refusal.message);
    admin = await current();
  }
  return { actor: { kind: "admin", adminId: admin!.id } satisfies AdminActor };
}

/** Clears the local rate limits, which every smoke test's requests from localhost share. */
export async function freshRateLimits(env: Env) {
  await env.DB.prepare("DELETE FROM rate_limit_hits").run();
  return {};
}
