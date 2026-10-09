import { expect, test } from "@playwright/test";
import { seed, signIn, signInAdmin, signOut } from "./support/helpers";

test("a Client Hires an Artisan who signed in on the same browser, and the Admin holds the Artisan's Payouts from the Signal", async ({
  browser,
}) => {
  const { email, password, jobId, artisan } = seed<{
    email: string;
    password: string;
    jobId: string;
    artisan: { email: string; password: string };
  }>("hire");

  // One browser, so one device: the Artisan signs in, then the Client.
  const shared = await (await browser.newContext()).newPage();
  await signIn(shared, artisan);
  await signOut(shared);
  await signIn(shared, { email, password });
  await shared.goto(`/jobs/${jobId}`);
  // A click before the page hydrates does nothing, so try until the Hire panel opens.
  await expect(async () => {
    await shared.getByRole("button", { name: "Hire", exact: true }).click();
    await expect(shared.getByText("Hire by paying for this Quote")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await shared.getByRole("checkbox", { name: /Protection Fee .* is not refunded/ }).click();
  await shared.getByRole("button", { name: /^Pay R/ }).click();
  await expect(shared).toHaveURL(/\/fake-checkout\//);
  await expect(async () => {
    await shared.getByRole("button", { name: "Pay", exact: true }).click();
    await expect(shared).toHaveURL(new RegExp(`/jobs/${jobId}$`), { timeout: 2000 });
  }).toPass();
  await expect(shared.getByText("Paid. Next: Work started")).toBeVisible();
  // Nobody is told of a Signal.
  await shared.goto("/notices");
  await expect(shared.getByText(/share/i)).toHaveCount(0);

  const { email: adminEmail } = seed<{ email: string }>("admin");
  const { itemId } = seed<{ itemId: string }>("sharedSignalItem", jobId);
  const asAdmin = await (await browser.newContext()).newPage();
  await signInAdmin(asAdmin, adminEmail);
  await asAdmin.goto(`/admin/items/${itemId}`);
  await expect(asAdmin.getByRole("heading", { name: /share a device/ })).toBeVisible();
  await expect(asAdmin.getByText(/Both were seen on the device/)).toBeVisible();
  await expect(asAdmin.getByRole("link", { name: "Open on the People page" })).toHaveCount(2);
  await expect(async () => {
    await asAdmin.getByRole("button", { name: "Hold Payouts" }).click({ timeout: 2000 });
    await expect(asAdmin.getByRole("radio", { name: /\(Artisan\)/ })).toBeVisible({
      timeout: 2000,
    });
  }).toPass();
  await expect(asAdmin.getByRole("radio", { name: /\(Artisan\)/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await asAdmin.getByRole("button", { name: "Record decision" }).click();
  await expect(asAdmin.getByText("Decision recorded: Hold Payouts")).toBeVisible();

  const asArtisan = await (await browser.newContext()).newPage();
  await signIn(asArtisan, artisan);
  await asArtisan.goto("/payouts");
  await expect(asArtisan.getByText(/The Admin holds your Payouts/)).toBeVisible();
});
