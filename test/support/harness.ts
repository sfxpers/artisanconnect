import { applyD1Migrations, env, reset } from "cloudflare:test";
import { createDomain, type Ports } from "@/domain";
import { createFakeClock } from "@/domain/fakes/clock";
import { createFakeContentReader } from "@/domain/fakes/content-reader";
import { createFakeMailer } from "@/domain/fakes/mailer";
import { createFakePayments } from "@/domain/fakes/payments";
import { given } from "./given";

/**
 * The seam every domain test drives: the module built on real local D1 and R2
 * (emptied and migrated for each harness) with a fake clock, content reader,
 * mailer, and payment adapter. Time moves only by advancing the clock and
 * running due clocks; money only by the payment adapter's controls.
 */
export async function createHarness() {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const clock = createFakeClock();
  const ports = {
    db: env.DB,
    files: env.R2,
    clock,
    contentReader: createFakeContentReader(),
    payments: createFakePayments({ clock }),
    mailer: createFakeMailer(),
  } satisfies Ports;
  const domain = createDomain(ports);
  return { ...ports, ports, domain, given: given(domain) };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
