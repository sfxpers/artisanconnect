import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

/** Runs a seed against the local app's D1, and gives what it printed. */
function seed<T>(...args: string[]): T {
  const output = execFileSync(process.execPath, ["e2e/support/seed.mjs", ...args], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

test("a Client marks Work started, and approves the Artisan's Completion", async ({ page }) => {
  const { email, password, jobId, engagementId } = seed<{
    email: string;
    password: string;
    jobId: string;
    engagementId: string;
  }>("hired");
  // Work started and Approve each ask to confirm.
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/sign-in");
  const signIn = page.getByRole("button", { name: "Sign in" });
  // Enabled once the page has hydrated and Turnstile has passed; filled sooner, it is emptied.
  await expect(signIn).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await signIn.click();
  await expect(page).toHaveURL(/\/jobs$/);

  // The seed's start date is 30 days out, so only the Client can mark Work started now.
  await page.goto(`/jobs/${jobId}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Work started", exact: true }).click();
    await expect(page.getByText("The Materials were released to the Artisan.")).toBeVisible({
      timeout: 2000,
    });
  }).toPass();

  seed("markedComplete", engagementId);
  await page.reload();
  await expect(page.getByText("The work is marked complete")).toBeVisible();
  await expect(page.getByText("Both walls have two coats, and the room is cleaned.")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /Approved by silence on/ })).toBeVisible();

  await expect(async () => {
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({
      timeout: 2000,
    });
  }).toPass();
  await expect(
    page.getByText("The work is approved, and the Labour was released to the Artisan."),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Released at Approval" }).getByText("Released", {
      exact: true,
    }),
  ).toBeVisible();
});
