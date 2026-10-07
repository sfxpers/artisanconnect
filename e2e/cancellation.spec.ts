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

test("the Client cancels before Work started, is refunded, and the Artisan sees it Cancelled", async ({
  browser,
}) => {
  const { email, password, jobId, artisan } = seed<{
    email: string;
    password: string;
    jobId: string;
    artisan: { email: string; password: string };
  }>("hired");

  const asClient = await (await browser.newContext()).newPage();
  // The Cancellation asks to confirm.
  asClient.on("dialog", (dialog) => void dialog.accept());
  await signIn(asClient, { email, password });
  await asClient.goto(`/jobs/${jobId}`);
  await expect(async () => {
    await asClient.getByRole("button", { name: "Cancel this Job" }).click({ timeout: 2000 });
    await asClient.getByLabel("Reason (optional)").fill("Found someone closer.", { timeout: 2000 });
    await asClient.getByRole("button", { name: "Cancel this Job" }).click({ timeout: 2000 });
    await expect(asClient.getByText(/You cancelled before Work started/)).toBeVisible({
      timeout: 2000,
    });
  }).toPass();
  await expect(asClient.getByText("On its way")).toBeVisible();

  const asArtisan = await (await browser.newContext()).newPage();
  await signIn(asArtisan, artisan);
  await asArtisan.goto(`/jobs/${jobId}`);
  await expect(asArtisan.getByText(/The Client cancelled before Work started/)).toBeVisible();
  await expect(asArtisan.getByRole("button", { name: "Cancel this Job" })).toHaveCount(0);
  // The reason is the Admin's to read.
  await expect(asArtisan.getByText("Found someone closer.")).toHaveCount(0);
  await asArtisan.goto(`/jobs/${jobId}?tab=messages`);
  await expect(asArtisan.getByText(/^Cancelled ·/)).toBeVisible();
  await expect(
    asArtisan.getByText("This Conversation has ended. It stays here to read."),
  ).toBeVisible();
});
