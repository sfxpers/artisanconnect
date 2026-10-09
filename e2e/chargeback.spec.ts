import { expect, test } from "@playwright/test";
import { seed, signIn, signInAdmin } from "./support/helpers";

test("a Chargeback freezes the Job, and once the bank closes it the Admin decides the unreleased money", async ({
  browser,
}) => {
  const { email, password, jobId, engagementId } = seed<{
    email: string;
    password: string;
    jobId: string;
    engagementId: string;
  }>("hired");

  const asClient = await (await browser.newContext()).newPage();
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

  seed("chargedBack", engagementId);
  await asClient.reload();
  await expect(asClient.getByText("Frozen by a Chargeback")).toBeVisible();
  await expect(asClient.getByText(/Your card Payment was charged back/).first()).toBeVisible();
  await expect(asClient.getByRole("button", { name: "Cancel" })).toHaveCount(0);

  const { email: adminEmail } = seed<{ email: string }>("admin");
  const { itemId } = seed<{ itemId: string }>("chargebackClosed", engagementId);
  const asAdmin = await (await browser.newContext()).newPage();
  await signInAdmin(asAdmin, adminEmail);
  await asAdmin.goto(`/admin/items/${itemId}`);
  await expect(
    asAdmin.getByRole("heading", { name: "Chargeback: Paint the lounge" }),
  ).toBeVisible();
  await expect(asAdmin.getByText(/lost by the platform, sending R\s\d/)).toBeVisible();
  await expect(async () => {
    await asAdmin.getByRole("tab", { name: "The Conversation" }).click({ timeout: 2000 });
    await asAdmin.getByRole("button", { name: /Open the Conversation/i }).click({ timeout: 2000 });
    await expect(asAdmin.getByText("Charged back").first()).toBeVisible({ timeout: 2000 });
  }).toPass();

  await asAdmin.getByRole("button", { name: "Decide the unreleased money" }).click();
  await asAdmin.getByLabel(/Labour released to the Artisan/).fill("40000");
  await expect(asAdmin.getByText(/Back to the Client: R\s/)).toBeVisible();
  await asAdmin.getByLabel("Reason, for both parties").fill("Some of the work was done.");
  await asAdmin.getByRole("button", { name: "Record decision" }).click();
  await expect(asAdmin.getByText("Decision recorded: Decide the unreleased money")).toBeVisible();

  await asClient.reload();
  await expect(asClient.getByText("Chargeback decided by the Admin").first()).toBeVisible();
  await expect(asClient.getByText(/R\s400,00 is released to the Artisan/)).toBeVisible();
  await expect(asClient.getByText(/Some of the work was done\./)).toBeVisible();
  await expect(asClient.getByText("Released, part charged back")).toBeVisible();
});
