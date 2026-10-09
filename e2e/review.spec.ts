import { expect, test, type Page } from "@playwright/test";
import { seed, signIn, signInAdmin } from "./support/helpers";

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
