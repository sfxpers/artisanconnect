import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/** Runs a seed against the local app's D1, and gives what it printed. */
function seed<T>(...args: string[]): T {
  const output = execFileSync(process.execPath, ["e2e/support/seed.mjs", ...args], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/sign-in");
  const button = page.getByRole("button", { name: "Sign in" });
  // Enabled once the page has hydrated and Turnstile has passed; filled sooner, it is emptied.
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await button.click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function signOut(page: Page) {
  await page.goto("/account");
  await expect(async () => {
    await page.getByRole("button", { name: "Sign out" }).click({ timeout: 2000 });
    await expect(page).not.toHaveURL(/\/account/, { timeout: 2000 });
  }).toPass();
}

/** Signs the Admin in with an Email code, read from the local app's mail. */
async function signInAdmin(page: Page, email: string) {
  await page.goto("/admin/sign-in");
  await expect(async () => {
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

test("a Client Hires an Artisan who signed in on the same browser, and the Admin holds the Artisan's Payouts from the Signal", async ({
  browser,
}) => {
  const { email, password, jobId, artisan } = seed<{
    email: string;
    password: string;
    jobId: string;
    artisan: { email: string; password: string };
  }>("hire");

  // One browser, so one device: the Artisan signs in, then the Client.
  const shared = await (await browser.newContext()).newPage();
  await signIn(shared, artisan);
  await signOut(shared);
  await signIn(shared, { email, password });
  await shared.goto(`/jobs/${jobId}`);
  // A click before the page hydrates does nothing, so try until the Hire panel opens.
  await expect(async () => {
    await shared.getByRole("button", { name: "Hire", exact: true }).click();
    await expect(shared.getByText("Hire by paying for this Quote")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await shared.getByRole("checkbox", { name: /Protection Fee .* is not refunded/ }).click();
  await shared.getByRole("button", { name: /^Pay R/ }).click();
  await expect(shared).toHaveURL(/\/fake-checkout\//);
  await expect(async () => {
    await shared.getByRole("button", { name: "Pay", exact: true }).click();
    await expect(shared).toHaveURL(new RegExp(`/jobs/${jobId}$`), { timeout: 2000 });
  }).toPass();
  await expect(shared.getByText("Paid. Next: Work started")).toBeVisible();
  // Nobody is told of a Signal.
  await shared.goto("/notices");
  await expect(shared.getByText(/share/i)).toHaveCount(0);

  const { email: adminEmail } = seed<{ email: string }>("admin");
  const { itemId } = seed<{ itemId: string }>("sharedSignalItem", jobId);
  const asAdmin = await (await browser.newContext()).newPage();
  await signInAdmin(asAdmin, adminEmail);
  await asAdmin.goto(`/admin/items/${itemId}`);
  await expect(asAdmin.getByRole("heading", { name: /share a device/ })).toBeVisible();
  await expect(asAdmin.getByText(/Both were seen on the device/)).toBeVisible();
  await expect(asAdmin.getByRole("link", { name: "Open on the People page" })).toHaveCount(2);
  await expect(async () => {
    await asAdmin.getByRole("button", { name: "Hold Payouts" }).click({ timeout: 2000 });
    await expect(asAdmin.getByRole("radio", { name: /\(Artisan\)/ })).toBeVisible({
      timeout: 2000,
    });
  }).toPass();
  await expect(asAdmin.getByRole("radio", { name: /\(Artisan\)/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await asAdmin.getByRole("button", { name: "Record decision" }).click();
  await expect(asAdmin.getByText("Decision recorded: Hold Payouts")).toBeVisible();

  const asArtisan = await (await browser.newContext()).newPage();
  await signIn(asArtisan, artisan);
  await asArtisan.goto("/payouts");
  await expect(asArtisan.getByText(/The Admin holds your Payouts/)).toBeVisible();
});
