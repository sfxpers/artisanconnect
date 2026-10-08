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

/** The Admin publishes the newest Review waiting on the Engagement. */
async function publish(page: Page, engagementId: string) {
  const { itemId } = seed<{ itemId: string }>("reviewItem", engagementId);
  await page.goto(`/admin/items/${itemId}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Publish", exact: true }).click({ timeout: 2000 });
    await page.getByRole("button", { name: "Record decision" }).click({ timeout: 2000 });
    await expect(page.getByText("Decision recorded: Publish")).toBeVisible({ timeout: 2000 });
  }).toPass();
}

/** The party writes their Review on the Job page. */
async function writeReview(page: Page, of: string, rating: number, comment: string) {
  await expect(async () => {
    await page.getByRole("radio", { name: `${rating} out of 5` }).click({ timeout: 2000 });
    await page.getByLabel("Comment (optional)").fill(comment, { timeout: 2000 });
    await expect(page.getByRole("button", { name: "Send the Review" })).toBeEnabled({
      timeout: 2000,
    });
  }).toPass();
  await expect(page.getByRole("heading", { name: `Review ${of}` })).toBeVisible();
  await page.getByRole("button", { name: "Send the Review" }).click();
  await expect(page.getByText("Being checked")).toBeVisible();
}

test("both parties Review a Completed Job, the Admin publishes them, and the Client's shows on the Profile", async ({
  browser,
}) => {
  const { email, password, jobId, engagementId, artisan } = seed<{
    email: string;
    password: string;
    jobId: string;
    engagementId: string;
    artisan: { email: string; password: string };
  }>("hired");

  const asClient = await (await browser.newContext()).newPage();
  // Work started and Approve each ask to confirm.
  asClient.on("dialog", (dialog) => void dialog.accept());
  await signIn(asClient, { email, password });
  await asClient.goto(`/jobs/${jobId}`);
  await expect(async () => {
    await asClient.getByRole("button", { name: "Work started", exact: true }).click({
      timeout: 2000,
    });
    await expect(asClient.getByText("The Materials were released to the Artisan.")).toBeVisible({
      timeout: 2000,
    });
  }).toPass();
  seed("markedComplete", engagementId);
  await asClient.reload();
  await expect(async () => {
    await asClient.getByRole("button", { name: "Approve", exact: true }).click({ timeout: 2000 });
    await expect(asClient.getByRole("heading", { name: "Review the Artisan" })).toBeVisible({
      timeout: 2000,
    });
  }).toPass();

  await writeReview(asClient, "the Artisan", 5, "Neat, quick, and cleaned up after.");
  await expect(asClient.getByText("The Admin checks it before it is shown.")).toBeVisible();

  const { email: adminEmail } = seed<{ email: string }>("admin");
  const asAdmin = await (await browser.newContext()).newPage();
  await signInAdmin(asAdmin, adminEmail);
  await publish(asAdmin, engagementId);

  const asArtisan = await (await browser.newContext()).newPage();
  await signIn(asArtisan, artisan);
  await asArtisan.goto(`/jobs/${jobId}`);
  // The Client's is not read until the Artisan has written theirs.
  await expect(asArtisan.getByText("Neat, quick, and cleaned up after.")).toHaveCount(0);
  await writeReview(asArtisan, "the Client", 4, "Clear about the job, and paid on time.");
  await expect(asArtisan.getByText("Neat, quick, and cleaned up after.")).toBeVisible();
  await expect(asArtisan.getByRole("button", { name: "Report this Review" })).toBeVisible();

  await publish(asAdmin, engagementId);
  await asClient.reload();
  await expect(asClient.getByText("Clear about the job, and paid on time.")).toBeVisible();
  await expect(asClient.getByText("Published")).toBeVisible();

  // The Artisan's Profile, by the link beside the Job.
  const href = await asClient.locator('aside a[href^="/artisans/"]').first().getAttribute("href");
  const asVisitor = await (await browser.newContext()).newPage();
  await asVisitor.goto(href!);
  await expect(asVisitor.getByText("5.0 out of 5, from 1 Review")).toBeVisible();
  await expect(asVisitor.getByText("Neat, quick, and cleaned up after.")).toBeVisible();
  await expect(asVisitor.getByText(/Thandi M\. · Painting/)).toBeVisible();
});
