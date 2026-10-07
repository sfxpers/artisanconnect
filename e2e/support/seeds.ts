import { createDomain, type DomainConfig } from "@/domain";
import type { AdminActor } from "@/domain/actor";
import { createFakeContentReader } from "@/domain/fakes/content-reader";
import { createFakeMailer } from "@/domain/fakes/mailer";
import { saDay } from "@/domain/sa-days";
import { configFromEnv, fakePaymentsFromEnv, portsFromEnv } from "@/worker/ports";
import { given } from "../../test/support/given";

// What a smoke test needs in the local app's D1, made by the domain tests'
// own builders through the module's commands. The Content check passes
// everything (the local app cannot reach Workers AI), and Email codes are
// read from a fake mailer, so nothing is sent.

/** A Client with an Invite-only Job and one Sent Quote on it, from a verified Artisan. */
export async function hire(env: Env) {
  const { domain, make } = await world(env);
  const { client, artisan, jobId } = await quoted(domain, make);
  return {
    email: client.email,
    password: client.password,
    jobId,
    artisan: { email: artisan.email, password: artisan.password },
  };
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
 * An Artisan with two Releases owed: one paid by today's Payout run, with its
 * Receipt, unless the run already went today, and one Released after the run,
 * waiting for the next. Prints the Artisan's sign-in.
 */
export async function payouts(env: Env) {
  // Today's run goes now, whatever the configured time.
  const { domain, make } = await world(env, { payoutRunTime: "00:00" });
  const payments = fakePaymentsFromEnv(env);
  const { client, artisan, jobId, quoteId } = await quoted(domain, make);
  await make.hired(client, quoteId);
  await make.workStarted(client, await make.engagementOf(client, jobId));
  const run = await domain.system.runPayouts();
  const [paid] = await sentPayouts(env, artisan.actor.accountId);
  if (paid) {
    const received = await domain.system.receivePaymentEvent(await payments.succeedPayout(paid));
    if (!received.ok) throw new Error(received.refusal.message);
  }
  const second = await make.openJob(client, { matching: "invite-only", title: "Paint the stoep" });
  const invited = await domain.invitations.invite(client.actor, {
    jobId: second,
    artisanId: artisan.actor.accountId,
  });
  if (!invited.ok) throw new Error(invited.refusal.message);
  const secondQuote = await make.sentQuote(artisan, second, {
    startOn: saDay(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
  });
  await make.hired(client, secondQuote);
  await make.workStarted(client, await make.engagementOf(client, second));
  return {
    ran: run.ran,
    paid: !!paid,
    artisan: { email: artisan.email, password: artisan.password },
  };
}

/** The ids of the Payouts the run sent the Artisan and the bank has not yet paid. */
async function sentPayouts(env: Env, artisanId: string) {
  const { results } = await env.DB.prepare(
    "select id from payouts where artisan_id = ? and state = 'pending'",
  )
    .bind(artisanId)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

/** The module on the local app's D1, and the builders over it. */
async function world(env: Env, config: Partial<DomainConfig> = {}) {
  const mailer = createFakeMailer();
  const domain = createDomain(
    { ...portsFromEnv(env), contentReader: createFakeContentReader(), mailer },
    { ...configFromEnv(env), ...config },
  );
  const make = given({
    domain,
    mailer,
    // The local app's own fake, so a Payment arrives as its checkout page would make it.
    payments: fakePaymentsFromEnv(env),
    admin: await anAdmin(env, domain),
    // New Identity Numbers and Payout accounts each run.
    start: Math.floor(Math.random() * 9000),
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
