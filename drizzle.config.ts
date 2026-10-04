import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into migrations/, which Wrangler applies to D1:
// nubx wrangler d1 migrations apply DB --local (or --env staging / production --remote).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/domain/schema.ts",
  out: "./migrations",
});
