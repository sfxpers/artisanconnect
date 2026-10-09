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
}

/** The newest Email code the local app sent to the address. */
async function codeSentTo(page: Page, email: string) {
  const mail = await page.context().newPage();
  await mail.goto("/dev/mail");
  const text = await mail.getByTestId("email").filter({ hasText: email }).first().innerText();
  await mail.close();
  return text.match(/\b\d{6}\b/)![0];
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
  await page.getByLabel("Email code").fill(await codeSentTo(page, email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("a Client changes its Email, gets a copy of its data, closes its Account, and reopens it", async ({
  browser,
}) => {
  // Reopening waits out the minute before a second Email code goes to the new Email.
  test.setTimeout(180_000);
  const { email, password, jobId } = seed<{ email: string; password: string; jobId: string }>(
    "hire",
  );
  const moved = `moved-${Date.now()}@example.com`;
  const asClient = await (await browser.newContext()).newPage();
  asClient.on("dialog", (dialog) => void dialog.accept());
  await signIn(asClient, { email, password });
  await expect(asClient).not.toHaveURL(/\/sign-in/);

  // The Email changes once the code sent to the new one is entered.
  await asClient.goto("/account");
  await expect(async () => {
    await asClient.getByRole("button", { name: "Change Email" }).click({ timeout: 2000 });
    await expect(asClient.getByLabel("New Email")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await asClient.getByLabel("New Email").fill(moved);
  await asClient.getByLabel("Your password").fill(password);
  await asClient.getByRole("button", { name: "Send a code" }).click();
  await asClient.getByLabel("Email code").fill(await codeSentTo(asClient, moved));
  await asClient.getByRole("button", { name: "Change my Email" }).click();
  await expect(asClient.getByText("Your Email is changed. We told your old Email.")).toBeVisible();
  await expect(asClient.getByText(moved)).toBeVisible();

  // A copy of the data, which the Admin sends.
  await asClient.getByRole("button", { name: "Ask for a copy" }).click();
  await expect(asClient.getByText("Waiting for the Admin")).toBeVisible();
  const { email: adminEmail } = seed<{ email: string }>("admin");
  const { itemId } = seed<{ itemId: string }>("dataRequestItem", moved);
  const asAdmin = await (await browser.newContext()).newPage();
  await signInAdmin(asAdmin, adminEmail);
  await asAdmin.goto(`/admin/items/${itemId}`);
  await expect(asAdmin.getByText("A copy of the data", { exact: true })).toBeVisible();
  await expect(async () => {
    await asAdmin.getByRole("button", { name: "Send the export" }).click({ timeout: 2000 });
    await expect(asAdmin.getByRole("button", { name: "Record decision" })).toBeEnabled({
      timeout: 2000,
    });
  }).toPass();
  await asAdmin.getByRole("button", { name: "Record decision" }).click();
  await expect(asAdmin.getByText("Decision recorded: Send the export")).toBeVisible();

  await asClient.reload();
  const download = asClient.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible();
  const exported = await asClient.request.get((await download.getAttribute("href"))!);
  expect(exported.ok()).toBe(true);
  expect(await exported.json()).toMatchObject({ account: { kind: "client", email: moved } });

  // Closing closes the Open Job and signs the Client out.
  await asClient.getByRole("button", { name: "Close my Account" }).click();
  await expect(asClient).toHaveURL(/\/$/);
  await signIn(asClient, { email: moved, password });
  await expect(
    asClient.getByText("This Account is closed. Reopen it with an Email code."),
  ).toBeVisible();

  // It reopens with its Email and a code.
  await asClient.getByRole("link", { name: "Reopen my Account" }).click();
  await expect(asClient).toHaveURL(/\/reopen/);
  const send = asClient.getByRole("button", { name: "Send a code" });
  await expect(asClient.getByLabel("Email", { exact: true })).toHaveValue(moved);
  // A new code goes to an Email only a minute after the last one.
  await expect(async () => {
    await send.click({ timeout: 5000 });
    await expect(asClient.getByLabel("Email code")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 90_000, intervals: [5000] });
  await asClient.getByLabel("Email code").fill(await codeSentTo(asClient, moved));
  await asClient.getByRole("button", { name: "Reopen my Account" }).click();
  await expect(asClient).not.toHaveURL(/\/reopen/);
  await asClient.goto(`/jobs/${jobId}`);
  await expect(asClient.getByText("Closed", { exact: true }).first()).toBeVisible();
});
