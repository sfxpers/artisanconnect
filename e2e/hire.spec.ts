import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

/** What the seed made in the local app's D1: a Client, and their Job with one Sent Quote. */
function seedHire(): { email: string; password: string; jobId: string } {
  const output = execFileSync(process.execPath, ["e2e/support/seed.mjs", "hire"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

test("a Client Hires a Sent Quote through the fake checkout", async ({ page }) => {
  const { email, password, jobId } = seedHire();

  await page.goto("/sign-in");
  const signIn = page.getByRole("button", { name: "Sign in" });
  // Enabled once the page has hydrated and Turnstile has passed; filled sooner, it is emptied.
  await expect(signIn).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await signIn.click();
  await expect(page).toHaveURL(/\/jobs$/);

  await page.goto(`/jobs/${jobId}`);
  // A click before the page hydrates does nothing, so try until the Hire panel opens.
  await expect(async () => {
    await page.getByRole("button", { name: "Hire", exact: true }).click();
    await expect(page.getByText("Hire by paying for this Quote")).toBeVisible({ timeout: 1000 });
  }).toPass();
  const pay = page.getByRole("button", { name: /^Pay R/ });
  await expect(pay).toBeDisabled();
  await page.getByRole("checkbox", { name: /Protection Fee .* is not refunded/ }).click();
  await pay.click();

  await expect(page).toHaveURL(/\/fake-checkout\//);
  await expect(page.getByText("Fake checkout")).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "Pay", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`), { timeout: 2000 });
  }).toPass();

  await expect(page.getByText("Paid. Next: Work started")).toBeVisible();
  await expect(page.getByText("Hired", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Payments", { exact: true })).toBeVisible();
});
