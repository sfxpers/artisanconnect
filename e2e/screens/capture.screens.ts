import type { Browser, Page } from "@playwright/test";
import { seed, signIn, signInAdmin, test } from "../support/helpers";

type Seeded = {
  client: { email: string; password: string };
  artisan: { email: string; password: string; id: string };
  quotedJobId: string;
  awaitingJobId: string;
  disputeItemId: string;
  admin: string;
};

type Screen = { name: string; path: string; act?: (page: Page) => Promise<void> };

const label = process.env.SCREENS ?? "after";
const widths = [375, 1280];
const schemes = ["light", "dark"] as const;

/** Signs in once, for the storage state every capture of the role reuses. */
async function stateOf(browser: Browser, signInWith: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  await signInWith(await context.newPage());
  const state = await context.storageState();
  await context.close();
  return state;
}

test("capture every designed screen", async ({ browser }) => {
  const s = seed<Seeded>("screens");
  const roles = {
    visitor: undefined,
    client: await stateOf(browser, (page) => signIn(page, s.client)),
    artisan: await stateOf(browser, (page) => signIn(page, s.artisan)),
    admin: await stateOf(browser, (page) => signInAdmin(page, s.admin)),
  };
  const screens: Record<keyof typeof roles, Screen[]> = {
    visitor: [
      { name: "landing", path: "/" },
      { name: "browse", path: "/artisans?category=painting" },
      { name: "profile", path: `/artisans/${s.artisan.id}` },
      { name: "sign-in", path: "/sign-in" },
      { name: "sign-up", path: "/sign-up" },
    ],
    client: [
      { name: "client-jobs", path: "/jobs" },
      { name: "quote-comparison", path: `/jobs/${s.quotedJobId}` },
      {
        name: "hire",
        path: `/jobs/${s.quotedJobId}`,
        act: (page) => page.getByRole("button", { name: "Hire", exact: true }).first().click(),
      },
      { name: "job-awaiting-approval", path: `/jobs/${s.awaitingJobId}` },
    ],
    artisan: [{ name: "artisan-home", path: "/home" }],
    admin: [
      { name: "admin-queues", path: "/admin" },
      { name: "admin-item", path: `/admin/items/${s.disputeItemId}` },
    ],
  };
  for (const [role, list] of Object.entries(screens)) {
    for (const width of widths) {
      for (const colorScheme of schemes) {
        const context = await browser.newContext({
          storageState: roles[role as keyof typeof roles],
          viewport: { width, height: width < 768 ? 812 : 800 },
          colorScheme,
        });
        const page = await context.newPage();
        for (const screen of list) {
          await page.goto(screen.path);
          // Turnstile keeps the network busy, so wait for hydration by time.
          await page.waitForTimeout(1500);
          await screen.act?.(page).catch(() => undefined);
          await page.waitForTimeout(300);
          await page.screenshot({
            path: `docs/review/screens/${label}/${screen.name}-${width}-${colorScheme}.jpg`,
            fullPage: true,
            type: "jpeg",
            quality: 70,
          });
        }
        await context.close();
      }
    }
  }
});
