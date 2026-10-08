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
