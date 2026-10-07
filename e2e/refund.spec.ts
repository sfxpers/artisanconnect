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

test("the Artisan refunds part of the Labour, and the Client sees it paid", async ({ browser }) => {
  const { email, password, jobId, engagementId, artisan } = seed<{
    email: string;
    password: string;
    jobId: string;
    engagementId: string;
    artisan: { email: string; password: string };
  }>("hired");

  const asArtisan = await (await browser.newContext()).newPage();
  // The Refund asks to confirm.
  asArtisan.on("dialog", (dialog) => void dialog.accept());
  await signIn(asArtisan, artisan);
  await asArtisan.goto(`/jobs/${jobId}`);
  await expect(async () => {
    await asArtisan.getByRole("button", { name: "Refund", exact: true }).click({ timeout: 2000 });
    await asArtisan.getByLabel(/Labour, up to/).fill("400", { timeout: 2000 });
    await asArtisan.getByRole("button", { name: "Refund", exact: true }).click({ timeout: 2000 });
    await expect(asArtisan.getByText("On its way")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await expect(asArtisan.getByText("Labour R 400,00", { exact: false })).toBeVisible();

  seed("refundPaid", engagementId);

  const asClient = await (await browser.newContext()).newPage();
  await signIn(asClient, { email, password });
  await asClient.goto(`/jobs/${jobId}`);
  await expect(
    asClient.getByRole("listitem").filter({ hasText: "R 400,00" }).getByText("Refunded"),
  ).toBeVisible();
  await asClient.goto(`/jobs/${jobId}?tab=messages`);
  await expect(asClient.getByText(/Refunded R\s400,00 ·/)).toBeVisible();
});
