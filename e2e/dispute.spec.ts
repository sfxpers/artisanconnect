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
