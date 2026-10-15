import type { Page } from "@playwright/test";
import { SERVICE_CATEGORY_NAMES } from "@/domain/shared/service-categories";
import { clickUntil, codeSentTo, expect, test } from "./support/helpers";

/** Signs a Visitor up as a Client or an Artisan, through to the proven Email. */
async function signUp(page: Page, kind: RegExp) {
  const email = `sign-up-${Date.now()}@example.com`;
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Sign up" })
    .click();

  await clickUntil(page.getByRole("radio", { name: kind }), () =>
    expect(page.getByLabel("Full name")).toBeVisible({ timeout: 1000 }),
  );
  await page.getByLabel("Full name").fill("Thandi Mokoena");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: /I accept the Marketplace rules/ }).click();
  await page.getByRole("checkbox", { name: /outside South Africa/ }).click();
  const send = page.getByRole("button", { name: "Send my Email code" });
  await expect(send).toBeEnabled({ timeout: 30_000 }); // once Turnstile has passed
  await send.click();

  await expect(page).toHaveURL(/\/confirm-email/);
  await page.getByLabel("Email code").fill(await codeSentTo(page, email));
  await page.getByRole("button", { name: "Confirm" }).click();
}

test("a Visitor signs up as a Client and lands ready to post a Job", async ({ page }) => {
  // The landing page: how a Job goes, the eight trades, fees before paying, what a badge is,
  // and that money is released after the work.
  await page.goto("/");
  for (const shown of [
    "How a Job goes",
    "Fees are shown before you pay",
    "A badge is a check, not a guarantee",
    "Money is released after the work",
    ...Object.values(SERVICE_CATEGORY_NAMES),
  ]) {
    await expect(page.getByText(shown, { exact: true }).first()).toBeVisible();
  }
  // Browsing asks a Visitor to sign up to post or invite.
  await page.goto("/artisans");
  await expect(
    page.getByText(/To post a Job or invite an Artisan to Quote, sign up/),
  ).toBeVisible();

  await signUp(page, /I need work done/);

  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByText("Post your first Job")).toBeVisible();
  const header = page.getByRole("navigation", { name: "Main" });
  await expect(header.getByRole("link")).toHaveText(["Jobs", "Find Artisans", "Account"]);
});

test("a Visitor signs up as an Artisan and lands at Verification, then is asked for Regions", async ({
  page,
}) => {
  await page.goto("/");
  await signUp(page, /I do the work/);

  await expect(page).toHaveURL(/\/verification$/);
  // Its checks in three groups: once, per Service Category, and optional.
  for (const group of [
    "Who you are, and where your Payouts go.",
    /^Three photos of your own finished work in each trade/,
    /^Extra badges on your Profile/,
  ]) {
    await expect(page.getByText(group)).toBeVisible();
  }
  const header = page.getByRole("navigation", { name: "Main" });
  await expect(header.getByRole("link")).toHaveText(["Home", "Profile", "Payouts", "Account"]);
  await header.getByRole("link", { name: "Home" }).click();
  // One card for what waits first, Verification; the Regions card asks for Regions.
  await expect(page.getByText("Get verified to start quoting")).toBeVisible();
  await expect(page.getByRole("link", { name: "Choose Regions" })).toBeVisible();
  for (const tab of [/^Job Matches/, /^Invitations/, /^Active Jobs/, /^Notices/]) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  }

  // Every setting in one place, an Artisan's included (#30), grouped under headings.
  await header.getByRole("link", { name: "Account" }).click();
  await expect(page.locator("dt")).toHaveText([
    "Kind",
    "Name",
    "Trading name",
    "Email",
    "Identity Number",
    "VAT number",
    "Payout account",
    "Marketplace rules",
    "Contact support",
    "Warnings",
    "Request my data",
    "Close Account",
  ]);
  // A new Email's code is sent only once Turnstile has passed (#20).
  await clickUntil(page.getByRole("button", { name: "Change Email" }), () =>
    expect(page.getByLabel("New Email")).toBeVisible({ timeout: 1000 }),
  );
  await expect(page.getByRole("button", { name: "Send a code" })).toBeEnabled({ timeout: 30_000 });
});
