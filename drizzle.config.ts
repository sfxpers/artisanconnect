import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/domain/schema.ts",
  out: "./db/migrations",
});
