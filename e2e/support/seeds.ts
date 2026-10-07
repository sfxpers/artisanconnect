import { createDomain } from "@/domain";
import type { AdminActor } from "@/domain/actor";
import { createFakeContentReader } from "@/domain/fakes/content-reader";
import { createFakeMailer } from "@/domain/fakes/mailer";
import { createFakePayments } from "@/domain/fakes/payments";
import { saDay } from "@/domain/sa-days";
import { configFromEnv, portsFromEnv } from "@/worker/ports";
import { given } from "../../test/support/given";

// What a smoke test needs in the local app's D1, made by the domain tests'
// own builders through the module's commands. The Content check passes
// everything (the local app cannot reach Workers AI), and Email codes are
// read from a fake mailer, so nothing is sent.

/** A Client with an Invite-only Job and one Sent Quote on it, from a verified Artisan. */
export async function hire(env: Env) {
  const mailer = createFakeMailer();
  const domain = createDomain(
    { ...portsFromEnv(env), contentReader: createFakeContentReader(), mailer },
    configFromEnv(env),
  );
  const stamp = Date.now();
  const make = given({
    domain,
    mailer,
    payments: createFakePayments(),
    admin: await anAdmin(env, domain),
    // New Identity Numbers and Payout accounts each run.
    start: Math.floor(Math.random() * 9000),
  });
  const client = await make.client({ email: `client-${stamp}@example.test` });
  const artisan = await make.matchableArtisan({ email: `artisan-${stamp}@example.test` });
  const jobId = await make.openJob(client, { matching: "invite-only" });
  const invited = await domain.invitations.invite(client.actor, {
    jobId,
    artisanId: artisan.actor.accountId,
  });
  if (!invited.ok) throw new Error(invited.refusal.message);
  await make.sentQuote(artisan, jobId, {
    startOn: saDay(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
  });
  return {
    email: client.email,
    password: client.password,
    jobId,
    artisan: { email: artisan.email, password: artisan.password },
  };
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
