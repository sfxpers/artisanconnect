import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

// Read-only: a suburb added or a rules version published can never be taken
// back, so this stops short of both, which the domain tests cover.

/** Runs a seed against the local app's D1, and gives what it printed. */
function seed<T>(...args: string[]): T {
  const output = execFileSync(process.execPath, ["e2e/support/seed.mjs", ...args], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

/** Signs the Admin in with an Email code, read from the local app's mail. */
async function signInAdmin(page: Page, email: string) {
  await page.goto("/admin/sign-in");
  await expect(async () => {
    // A cold dev server may take a while to ask for the code once it is sent.
    if (await page.getByLabel("Email code").isVisible()) return;
    // Filled before hydration it is emptied, so fill it until the code is asked for.
    await page.getByLabel("Email", { exact: true }).fill(email, { timeout: 2000 });
    await page.getByRole("button", { name: "Send my sign-in code" }).click({ timeout: 2000 });
    await expect(page.getByLabel("Email code")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  const mail = await page.context().newPage();
  await mail.goto("/dev/mail");
  const text = await mail.getByTestId("email").filter({ hasText: email }).first().innerText();
  await mail.close();
  await page.getByLabel("Email code").fill(text.match(/\b\d{6}\b/)![0]);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("the Admin reads the figures, is asked again for a suburb that reads alike, and stops short of publishing rules", async ({
  page,
}) => {
  seed("hired");
  const { email } = seed<{ email: string }>("admin");
  await signInAdmin(page, email);

  await page.getByRole("link", { name: "Figures" }).click();
  await expect(page.getByRole("heading", { name: "Figures" })).toBeVisible();
  await expect(page.getByText(/^Since /)).toBeVisible();
  await expect(page.getByText(/^\d+ of \d+ Hires are Completed\.$/)).toBeVisible();
  await page.getByRole("link", { name: "All time" }).click();
  await expect(page).toHaveURL(/period=all/);
  await expect(page.getByText("Since the start")).toBeVisible();

  await page.getByRole("link", { name: "Suburbs" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Sea Point");
  await page.getByLabel("Region", { exact: true }).selectOption({ label: "Southern" });
  await page.getByRole("button", { name: "Add the suburb" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "SEA POINT is already a suburb, in Table Bay. A suburb is never moved or renamed.",
  );
  await page.getByLabel("Name", { exact: true }).fill("BO KAAP");
  await page.getByLabel("Region", { exact: true }).selectOption({ label: "Table Bay" });
  await page.getByRole("button", { name: "Add the suburb" }).click();
  await expect(page.getByRole("alert")).toContainText("BO KAAP reads like BO-KAAP (Table Bay).");
  await expect(page.getByRole("button", { name: "Add it anyway" })).toBeVisible();

  await page.getByRole("link", { name: "Rules" }).click();
  await expect(page.getByText(/Accounts have accepted it\.$/)).toBeVisible();
  await page.getByLabel("What changed").fill("Fees are now shown in bold.");
  await page.getByRole("button", { name: /^Publish version \d+$/ }).click();
  await expect(page.getByText(/Every Account is told at once/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: /^Publish version \d+$/ })).toBeVisible();
});
