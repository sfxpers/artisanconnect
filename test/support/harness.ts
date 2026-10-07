import { applyD1Migrations, env, reset } from "cloudflare:test";
import { onTestFinished, vi } from "vitest";
import { createDomain, type DomainConfig, type Ports } from "@/domain";
import { createFakeClock, type FakeClock } from "@/domain/fakes/clock";
import { createFakeContentReader } from "@/domain/fakes/content-reader";
import { createFakeMailer } from "@/domain/fakes/mailer";
import { createFakePayments } from "@/domain/fakes/payments";
import { given } from "./given";

export const TEST_CONFIG: DomainConfig = {
  appUrl: "https://artisanconnect.test",
  authSecret: "a-test-secret-that-is-long-enough-for-better-auth",
};

/**
 * The seam every domain test drives: the module built on real local D1 and R2
 * (emptied and migrated for each harness) with a fake clock, content reader,
 * mailer, and payment adapter. Time moves only by advancing the clock and
 * running due clocks; money only by the payment adapter's controls.
 */
export async function createHarness() {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const clock = withSystemTime(createFakeClock());
  const mailer = createFakeMailer();
  const payments = createFakePayments({ clock });
  const ports = {
    db: env.DB,
    files: env.R2,
    clock,
    contentReader: createFakeContentReader(),
    payments,
    mailer,
  } satisfies Ports;
  const domain = createDomain(ports, TEST_CONFIG);
  return { ...ports, ports, domain, given: given({ domain, mailer, payments }) };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/**
 * better-auth reads the time from `Date`, not from the clock port, so the
 * system time follows the fake clock for the length of the test.
 */
function withSystemTime(clock: FakeClock): FakeClock {
  vi.useFakeTimers({ toFake: ["Date"], now: clock.now() });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  return {
    now: clock.now,
    set(date) {
      clock.set(date);
      vi.setSystemTime(clock.now());
    },
    advance(by) {
      clock.advance(by);
      vi.setSystemTime(clock.now());
    },
  };
}
