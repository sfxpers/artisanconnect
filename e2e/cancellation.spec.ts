import { expect, test } from "@playwright/test";
import { seed, signIn } from "./support/helpers";

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
