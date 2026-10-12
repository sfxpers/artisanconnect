import type { Page } from "@playwright/test";
import { SERVICE_CATEGORY_NAMES } from "@/domain/service-categories";
import { codeSentTo, expect, test } from "./support/helpers";

/** Signs a Visitor up as a Client or an Artisan, through to the proven Email. */
async function signUp(page: Page, kind: RegExp) {
  const email = `sign-up-${Date.now()}@example.com`;
  await page.getByRole("navigation").getByRole("link", { name: "Sign up" }).click();

  // A click before the page hydrates does nothing, so try until the next row opens.
  await expect(async () => {
    await page.getByRole("button", { name: kind }).click();
    await expect(page.getByLabel("Full name")).toBeVisible({ timeout: 1000 });
  }).toPass();
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
  // The landing page: how a Job goes, the eight trades, fees before paying, and what a badge is.
  await page.goto("/");
  for (const shown of [
    "How a Job goes",
    "Fees shown before you pay",
    "A badge is a check, not a guarantee",
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
  await expect(page.getByText("Choose your Regions").first()).toBeVisible();
  for (const tab of [/^Job Matches/, /^Invitations/, /^Active Jobs/, /^Notices/]) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  }
});
