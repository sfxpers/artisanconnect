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
/** Where the captures go: docs/review/screens/<SCREENS>, unless SCREENS_DIR says. */
const dir = process.env.SCREENS_DIR ?? `docs/review/screens/${label}`;
/** With SCREENS_ALL set, every other screen too, for a review of the whole app. */
const all = Boolean(process.env.SCREENS_ALL);
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
  if (all) {
    screens.visitor.push(
      { name: "browse-no-trade", path: "/artisans" },
      { name: "rules", path: "/rules" },
      { name: "recover", path: "/recover" },
      { name: "reopen", path: "/reopen" },
      { name: "not-found", path: "/no-such-page" },
    );
    screens.client.push(
      { name: "job-new", path: "/jobs/new" },
      { name: "job-messages", path: `/jobs/${s.awaitingJobId}?tab=messages` },
      { name: "job-details", path: `/jobs/${s.awaitingJobId}?tab=details` },
      { name: "client-account", path: "/account" },
      { name: "client-notices", path: "/notices" },
      { name: "client-support", path: "/support" },
      { name: "client-profile-view", path: `/artisans/${s.artisan.id}` },
    );
    screens.artisan.push(
      { name: "artisan-offered-quoted", path: `/jobs/${s.quotedJobId}` },
      { name: "artisan-job-awaiting", path: `/jobs/${s.awaitingJobId}` },
      { name: "artisan-profile-edit", path: "/profile" },
      { name: "artisan-verification", path: "/verification" },
      { name: "artisan-regions", path: "/regions" },
      { name: "artisan-payouts", path: "/payouts" },
      { name: "artisan-account", path: "/account" },
    );
    screens.admin.push(
      { name: "admin-people", path: "/admin/people?q=Sipho" },
      { name: "admin-person", path: `/admin/people/${s.artisan.id}` },
      { name: "admin-payouts", path: "/admin/payouts" },
      { name: "admin-payout-history", path: `/admin/payouts/${s.artisan.id}` },
      { name: "admin-figures", path: "/admin/figures" },
      { name: "admin-suburbs", path: "/admin/suburbs" },
      { name: "admin-rules", path: "/admin/rules" },
      { name: "admin-admins", path: "/admin/admins" },
      { name: "admin-audit", path: "/admin/audit" },
    );
  }
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
          // The dev server's router devtools button is not part of the design.
          await page.addStyleTag({
            content: "[aria-label='Open TanStack Router Devtools'] { display: none !important; }",
          });
          // Turnstile keeps the network busy, so wait for hydration by time.
          await page.waitForTimeout(1500);
          await screen.act?.(page).catch(() => undefined);
          await page.waitForTimeout(300);
          await page.screenshot({
            path: `${dir}/${screen.name}-${width}-${colorScheme}.jpg`,
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
