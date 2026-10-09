import { expect, test, type Page } from "@playwright/test";
import { seed, signIn, signInAdmin } from "./support/helpers";

/** A small JPEG the page draws, as a file to choose. */
async function jpeg(page: Page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#c2410c";
    context.fillRect(0, 0, 64, 48);
    context.fillStyle = "#fde68a";
    context.fillRect(8, 8, 24, 16);
    return canvas.toDataURL("image/jpeg");
  });
  return {
    name: "wall.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(dataUrl.split(",")[1]!, "base64"),
  };
}

test("a Client Hires Again from a Completed Job, and only that Artisan is invited", async ({
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
    await expect(asClient.getByRole("button", { name: "Hire Again" })).toBeVisible({
      timeout: 2000,
    });
  }).toPass();

  await asClient.getByRole("button", { name: "Hire Again" }).click();
  await expect(asClient).not.toHaveURL(new RegExp(`/jobs/${jobId}`));
  const again = asClient.url().split("/jobs/")[1]!.split("?")[0]!;
  await expect(asClient.getByText(/Filled in from your last Job with/)).toBeVisible();
  await expect(asClient.getByLabel("Title")).not.toHaveValue("");
  await expect(asClient.getByText("Find Artisans for me")).toHaveCount(0);

  await asClient.getByLabel("Photos").setInputFiles(await jpeg(asClient));
  await asClient.getByRole("button", { name: "Post Job" }).click();
  // In dev the Content check cannot run, so the Job waits for the Admin.
  await expect(asClient.getByText(/The Admin is checking this Job/)).toBeVisible();

  const { email: adminEmail } = seed<{ email: string }>("admin");
  const asAdmin = await (await browser.newContext()).newPage();
  await signInAdmin(asAdmin, adminEmail);
  const { itemId } = seed<{ itemId: string }>("heldJobItem", again);
  await asAdmin.goto(`/admin/items/${itemId}`);
  await expect(async () => {
    await asAdmin.getByRole("button", { name: "Release", exact: true }).click({ timeout: 2000 });
    await asAdmin.getByRole("button", { name: "Record decision" }).click({ timeout: 2000 });
    await expect(asAdmin.getByText("Decision recorded: Release")).toBeVisible({ timeout: 2000 });
  }).toPass();

  await asClient.reload();
  await expect(asClient.getByText(/is invited to this Job\. Nobody else sees it\./)).toBeVisible();
  await expect(asClient.getByText("Invited", { exact: true })).toBeVisible();

  const asArtisan = await (await browser.newContext()).newPage();
  await signIn(asArtisan, artisan);
  await asArtisan.goto(`/jobs/${again}`);
  await expect(
    asArtisan.getByText("The Client chose you and invited you to Quote on this Job."),
  ).toBeVisible();

  // The Admin sees the pair's Protected Relationship Period running.
  await asAdmin.goto(`/admin/people?q=${encodeURIComponent(email)}`);
  await asAdmin.getByRole("link", { name: new RegExp(email) }).click();
  await expect(asAdmin.getByText("Client Relationships")).toBeVisible();
  await expect(asAdmin.getByText("Running", { exact: true })).toBeVisible();
});
