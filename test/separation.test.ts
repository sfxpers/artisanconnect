import { parse } from "jsonc-parser";
import { describe, expect, expectTypeOf, test } from "vitest";
import wranglerConfig from "../wrangler.jsonc?raw";
import { createDomain, PORT_NAMES, type Ports } from "@/domain";
import { createHarness } from "./support/harness";

// ADR 0018: this product does not know EcoBuiltConnect. There is no path to or
// from it because the module's ports and the Worker's bindings are exactly
// the ones ADR 0017 names, and nothing else exists that could become a path.
// An allowlist, never a denylist: a denylist would itself be knowledge of the
// other product.

describe("the domain module", () => {
  test("has exactly the ports D1, R2, a clock, a content reader, a payment adapter, and a mailer", async () => {
    expectTypeOf<keyof Ports>().toEqualTypeOf<
      "db" | "files" | "clock" | "contentReader" | "payments" | "mailer"
    >();
    expect([...PORT_NAMES].sort()).toEqual([
      "clock",
      "contentReader",
      "db",
      "files",
      "mailer",
      "payments",
    ]);
  });

  test("cannot be built with any other port", async () => {
    const { ports } = await createHarness();

    expect(() => createDomain({ ...ports, importer: {} } as Ports)).toThrow(/exactly the ports/);
  });

  test("cannot be built without one of its ports", async () => {
    const { ports } = await createHarness();
    const { mailer: _, ...withoutMailer } = ports;

    expect(() => createDomain(withoutMailer as unknown as Ports)).toThrow(/exactly the ports/);
  });
});

type WorkerConfig = Record<string, unknown> & { env?: Record<string, Record<string, unknown>> };
const config = parse(wranglerConfig) as WorkerConfig;

/** Every key a Worker environment may have; anything else could be a path out. */
const ENVIRONMENT_KEYS = [
  "vars",
  "secrets",
  "assets",
  "ai",
  "d1_databases",
  "r2_buckets",
  "send_email",
];
const TOP_LEVEL_KEYS = [
  "$schema",
  "name",
  "compatibility_date",
  "compatibility_flags",
  "main",
  "workers_dev",
  "observability",
  "triggers",
  "env",
  ...ENVIRONMENT_KEYS,
];

const environments: [string, Record<string, unknown>][] = [
  ["local", config],
  ...Object.entries(config.env ?? {}),
];

function bindingNames(environment: Record<string, unknown>) {
  const named = (key: string, field: string) =>
    ((environment[key] as Record<string, string>[] | undefined) ?? []).map(
      (binding) => binding[field],
    );
  return [
    (environment.assets as { binding?: string } | undefined)?.binding,
    (environment.ai as { binding?: string } | undefined)?.binding,
    ...named("d1_databases", "binding"),
    ...named("r2_buckets", "binding"),
    ...named("send_email", "name"),
  ].sort();
}

describe("the Worker", () => {
  test("has exactly local, staging, and production", () => {
    expect(environments.map(([name]) => name)).toEqual(["local", "staging", "production"]);
  });

  test("has no configuration but what ADR 0017 needs", () => {
    expect(Object.keys(config).filter((key) => !TOP_LEVEL_KEYS.includes(key))).toEqual([]);
    for (const [, environment] of environments.slice(1)) {
      expect(Object.keys(environment).filter((key) => !ENVIRONMENT_KEYS.includes(key))).toEqual([]);
    }
  });

  test.each(environments)(
    "binds exactly D1, R2, Workers AI, Email Sending, and its assets in %s",
    (_, environment) => {
      expect(bindingNames(environment)).toEqual(["AI", "ASSETS", "DB", "R2", "SEND_EMAIL"]);
      expect(Object.keys(environment.vars as object).sort()).toEqual([
        "APP_NAME",
        "ENVIRONMENT",
        "MAIL_FROM",
      ]);
      expect((environment.secrets as { required: string[] }).required).toEqual(["SENTRY_DSN"]);
    },
  );

  test("gives each environment its own D1 and R2", () => {
    const databases = environments.map(
      ([, e]) => (e.d1_databases as { database_name: string }[])[0]?.database_name,
    );
    const buckets = environments.map(
      ([, e]) => (e.r2_buckets as { bucket_name: string }[])[0]?.bucket_name,
    );

    expect(new Set(databases).size).toBe(3);
    expect(new Set(buckets).size).toBe(3);
  });

  test("runs due clocks every minute", () => {
    expect(config.triggers).toEqual({ crons: ["* * * * *"] });
  });
});
