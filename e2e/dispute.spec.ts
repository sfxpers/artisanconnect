import { expect, test } from "@playwright/test";
import { seed, signIn, signInAdmin } from "./support/helpers";

test("the Client disputes part of the Labour, and the Admin splits it after reading the Conversation", async ({
  browser,
}) => {
  const { email, password, jobId, engagementId } = seed<{
    email: string;
    password: string;
    jobId: string;
    engagementId: string;
  }>("hired");

  const asClient = await (await browser.newContext()).newPage();
  // Work started and the Dispute each ask to confirm.
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
    await asClient.getByRole("button", { name: "Dispute part of the Labour" }).click({
      timeout: 2000,
    });
    await asClient.getByLabel("Amount of the Labour disputed, in rands").fill("600", {
      timeout: 2000,
    });
  }).toPass();
  await asClient.getByLabel("Why").fill("The second coat is missing on the east wall.");
  await asClient.getByRole("button", { name: "Open the Dispute" }).click();
  await expect(asClient.getByText("Disputed: the Admin decides")).toBeVisible();
  await expect(
    asClient.getByText(/You disputed part of the Labour, and R\s600,00 is held/),
  ).toBeVisible();
  await expect(
    asClient.getByRole("progressbar", { name: /The Labour not in Dispute is released on/ }),
  ).toBeVisible();

  const { email: adminEmail } = seed<{ email: string }>("admin");
  const { itemId } = seed<{ itemId: string }>("disputeItem", engagementId);
  const asAdmin = await (await browser.newContext()).newPage();
  await signInAdmin(asAdmin, adminEmail);
  await asAdmin.goto(`/admin/items/${itemId}`);
  await expect(asAdmin.getByRole("heading", { name: "Dispute: Paint the lounge" })).toBeVisible();
  await expect(async () => {
    await asAdmin.getByRole("tab", { name: "The Conversation" }).click({ timeout: 2000 });
    await asAdmin.getByRole("button", { name: /Open the Conversation/i }).click({ timeout: 2000 });
    await expect(asAdmin.getByText(/Dispute opened: R\s600,00/)).toBeVisible({ timeout: 2000 });
  }).toPass();

  await asAdmin.getByRole("button", { name: "Split the held amount" }).click();
  await asAdmin.getByLabel(/Released to the Artisan/).fill("40000");
  await expect(asAdmin.getByText(/Refunded to the Client: R\s200,00/)).toBeVisible();
  await asAdmin
    .getByLabel("Reason, for both parties")
    .fill("One more coat is due; two thirds is fair.");
  await asAdmin.getByRole("button", { name: "Record decision" }).click();
  await expect(asAdmin.getByText("Decision recorded: Split the held amount")).toBeVisible();

  await asClient.reload();
  await expect(
    asClient.getByText("The work is approved, and the Labour was released to the Artisan."),
  ).toBeVisible();
  await expect(asClient.getByText("One more coat is due; two thirds is fair.")).toBeVisible();
  await expect(asClient.getByText(/Refunded to you/)).toBeVisible();
});
