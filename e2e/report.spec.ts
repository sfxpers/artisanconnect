import { expect, test } from "@playwright/test";
import { seed, signIn, signInAdmin } from "./support/helpers";

test("a Client Reports a Quote, the Admin suspends its Artisan from the Report, then lifts it on the People page", async ({
  browser,
}) => {
  const { email, password, jobId, quoteId, artisan } = seed<{
    email: string;
    password: string;
    jobId: string;
    quoteId: string;
    artisan: { email: string; password: string };
  }>("hire");

  const asClient = await (await browser.newContext()).newPage();
  await signIn(asClient, { email, password });
  await asClient.goto(`/jobs/${jobId}`);
  // A click before the page hydrates does nothing, so try until the form opens.
  await expect(async () => {
    await asClient.getByRole("button", { name: "Report", exact: true }).click({ timeout: 2000 });
    await expect(asClient.getByText("Why are you reporting it?")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await asClient.getByLabel("Asking to leave the platform").check();
  await asClient
    .getByLabel("Anything the Admin should know (optional)")
    .fill("The scope says to pay the rest in cash.");
  await asClient.getByRole("button", { name: "Send to the Admin" }).click();
  await expect(asClient.getByText("Reported. The Admin has it.")).toBeVisible();

  const { email: adminEmail } = seed<{ email: string }>("admin");
  const { itemId } = seed<{ itemId: string }>("reportItem", quoteId);
  const asAdmin = await (await browser.newContext()).newPage();
  await signInAdmin(asAdmin, adminEmail);
  await asAdmin.goto(`/admin/items/${itemId}`);
  await expect(
    asAdmin.getByRole("heading", { name: "Report of a Quote: Paint the lounge" }),
  ).toBeVisible();
  await expect(asAdmin.getByText(/Asking to leave the platform/)).toBeVisible();
  await expect(async () => {
    await asAdmin.getByRole("button", { name: "Suspend", exact: true }).click({ timeout: 2000 });
    await expect(asAdmin.getByLabel("Reason")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await asAdmin.getByLabel("Reason").fill("Asked a Client to pay in cash.");
  await asAdmin.getByRole("button", { name: "Record decision" }).click();
  await expect(asAdmin.getByText("Decision recorded: Suspend")).toBeVisible();

  const asArtisan = await (await browser.newContext()).newPage();
  await signIn(asArtisan, artisan);
  await expect(asArtisan.getByText("Your Account is suspended").first()).toBeVisible();
  await expect(asArtisan.getByText(/Asked a Client to pay in cash\./).first()).toBeVisible();

  await asAdmin.goto(`/admin/people?q=${encodeURIComponent(artisan.email)}`);
  await asAdmin.getByRole("link", { name: new RegExp(artisan.email) }).click();
  await expect(asAdmin.getByText(/Suspended: Asked a Client to pay in cash\./)).toBeVisible();
  await expect(async () => {
    await asAdmin.getByRole("button", { name: "Lift the Suspension" }).click({ timeout: 2000 });
    await expect(asAdmin.getByLabel("Note (optional)")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await asAdmin.getByRole("button", { name: "Record" }).click();
  await expect(asAdmin.getByText("The Suspension is lifted.")).toBeVisible();

  await asArtisan.reload();
  await expect(asArtisan.getByText("Your Account is suspended")).toHaveCount(0);
});
