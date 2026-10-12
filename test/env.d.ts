/// <reference types="@cloudflare/vitest-plugin/types" />

declare namespace Cloudflare {
  interface Env {
    /** The D1 migrations, read by vitest.config.ts. Tests only. */
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
