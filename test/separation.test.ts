import { describe, expect, test } from "vite-plus/test";
import { WORKER_ENVIRONMENTS, WORKER_SHARED } from "../cloudflare-environments";
import { createDomain, type Ports } from "@/domain";
import { createHarness, TEST_CONFIG } from "./support/harness";

// ADR 0018: this product does not know EcoBuiltConnect. There is no path to or
// from it because the module's ports and the Worker's bindings are exactly
// the ones ADR 0017 names, and nothing else exists that could become a path.
// An allowlist, never a denylist: a denylist would itself be knowledge of the
// other product.

describe("the domain module", () => {
  test("cannot be built with any other port", async () => {
    const { ports } = await createHarness();

    expect(() => createDomain({ ...ports, importer: {} } as Ports, TEST_CONFIG)).toThrow(
      /exactly the ports/,
    );
  });
});

type EnvironmentConfig = typeof WORKER_SHARED &
  (typeof WORKER_ENVIRONMENTS)[keyof typeof WORKER_ENVIRONMENTS];

/** Every key a Worker environment may have; anything else could be a path out. */
const ENVIRONMENT_KEYS = [
  "name",
  "workers_dev",
  "preview_urls",
  // Production's custom domain.
  "routes",
  "vars",
  "ratelimits",
  "d1_databases",
  "r2_buckets",
];

const SHARED_KEYS = [
  "compatibility_date",
  "compatibility_flags",
  "main",
  "observability",
  "upload_source_maps",
  "triggers",
  "ai",
  "images",
  "send_email",
  "secrets",
];

const environments: [string, EnvironmentConfig][] = (
  Object.entries(WORKER_ENVIRONMENTS) as [
    keyof typeof WORKER_ENVIRONMENTS,
    (typeof WORKER_ENVIRONMENTS)[keyof typeof WORKER_ENVIRONMENTS],
  ][]
).map(([name, environment]) => [name, { ...WORKER_SHARED, ...environment }]);

function bindingNames(environment: EnvironmentConfig) {
  const named = (key: "d1_databases" | "r2_buckets" | "send_email" | "ratelimits", field: string) =>
    ((environment[key] as Record<string, string>[] | undefined) ?? []).map(
      (binding) => binding[field],
    );
  return [
    environment.ai?.binding,
    environment.images?.binding,
    ...named("d1_databases", "binding"),
    ...named("r2_buckets", "binding"),
    ...named("send_email", "name"),
    ...named("ratelimits", "name"),
  ].sort((a = "", b = "") => a.localeCompare(b));
}

describe("the Worker", () => {
  test("has exactly local, staging, and production", () => {
    expect(environments.map(([name]) => name)).toEqual(["local", "staging", "production"]);
  });

  test("has no configuration but what ADR 0017 needs", () => {
    expect(Object.keys(WORKER_SHARED).filter((key) => !SHARED_KEYS.includes(key as never))).toEqual(
      [],
    );
    for (const [, environment] of Object.entries(WORKER_ENVIRONMENTS)) {
      expect(
        Object.keys(environment).filter((key) => !ENVIRONMENT_KEYS.includes(key as never)),
      ).toEqual([]);
    }
  });

  test.each(environments)(
    "binds exactly D1, R2, Images, Workers AI, Email Sending, and a rate limit in %s",
    (_, environment) => {
      expect(bindingNames(environment)).toEqual([
        "AI",
        "DB",
        "IMAGES",
        "IP_LIMIT",
        "R2",
        "SEND_EMAIL",
      ]);
      expect(Object.keys(environment.vars as object).sort()).toEqual([
        "APP_URL",
        "ENVIRONMENT",
        "MAIL_FROM",
        "PAYOUT_RUN_TIME",
        "TURNSTILE_SITE_KEY",
      ]);
      // better-auth's session signing, Turnstile (ADR 0017), and the payment
      // adapter's webhook signing.
      expect(environment.secrets.required).toEqual([
        "BETTER_AUTH_SECRET",
        "TURNSTILE_SECRET_KEY",
        "PAYMENTS_WEBHOOK_SECRET",
      ]);
    },
  );

  test("gives each environment its own D1 and R2", () => {
    const databases = environments.map(([, e]) => e.d1_databases[0]?.database_name);
    const buckets = environments.map(([, e]) => e.r2_buckets[0]?.bucket_name);

    expect(new Set(databases).size).toBe(3);
    expect(new Set(buckets).size).toBe(3);
  });

  test("keeps Workers Logs, and reports every failure and logged error to Workers Issues", () => {
    expect(WORKER_SHARED.observability).toEqual({ enabled: true, issues: { enabled: true } });
  });

  test("runs due clocks every minute", () => {
    expect(WORKER_SHARED.triggers).toEqual({ crons: ["* * * * *"] });
  });
});

// Every host the code names, read from the source itself.
const sources = import.meta.glob<string>("../src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("the code", () => {
  test("reaches no host but Cloudflare's own", () => {
    const hosts = new Set(
      Object.values(sources).flatMap((text) =>
        [...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((match) => match[1]!.toLowerCase()),
      ),
    );
    // sitemaps.org is the sitemap's XML namespace, which is never fetched.
    expect([...hosts].sort()).toEqual(["challenges.cloudflare.com", "www.sitemaps.org"]);
  });
});
