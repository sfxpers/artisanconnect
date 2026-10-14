import { clickUntil, expect, seed, signIn, signInAdmin, signOut, test } from "./support/helpers";

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
  await clickUntil(shared.getByRole("button", { name: "Hire", exact: true }), () =>
    expect(shared.getByText("Hire by paying for this Quote")).toBeVisible({ timeout: 1000 }),
  );
  await shared.getByRole("checkbox", { name: /Protection Fee .* is not refunded/ }).click();
  await shared.getByRole("button", { name: /^Pay R/ }).click();
  await expect(shared).toHaveURL(/\/fake-checkout\//);
  await clickUntil(shared.getByRole("button", { name: "Pay", exact: true }), () =>
    expect(shared).toHaveURL(new RegExp(`/jobs/${jobId}$`), { timeout: 2000 }),
  );
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
  await clickUntil(asAdmin.getByRole("button", { name: "Hold Payouts" }), () =>
    expect(asAdmin.getByRole("radio", { name: /\(Artisan\)/ })).toBeVisible({ timeout: 2000 }),
  );
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
  // An Artisan's settings rows include its VAT number, Payout account, and Identity Number.
  await asArtisan.goto("/account");
  for (const row of ["VAT number", "Payout account", "Identity Number"]) {
    await expect(asArtisan.getByText(row, { exact: true })).toBeVisible();
  }
});
