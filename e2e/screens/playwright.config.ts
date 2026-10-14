import { defineConfig } from "@playwright/test";
import smoke from "../../playwright.config";

// Not a test: saves each designed screen at 375 and 1280 pixels wide, light
// and dark, to docs/review/screens/<SCREENS>/ (#111's Design section).
//   SCREENS=after nub x playwright test -c e2e/screens
export default defineConfig({
  ...smoke,
  testDir: ".",
  testMatch: "*.screens.ts",
  timeout: 600_000,
});
