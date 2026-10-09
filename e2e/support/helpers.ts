import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";

// What the smoke specs share: seeds, the local mailbox, and signing in. A
// dev server Playwright has just started is slow on its first requests, so
// waits after a submit are long, and a retried step checks first whether the
// last try already got through.

/** How long a submit may take on a cold dev server. */
const SUBMITTED_MS = 30_000;

/** Runs a seed against the local app's D1, and gives what it printed. */
export function seed<T>(...args: string[]): T {
  const output = execFileSync(process.execPath, ["e2e/support/seed.mjs", ...args], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

/** The newest Email code the local app sent to an address. */
export async function codeSentTo(page: Page, email: string): Promise<string> {
  const mailbox = await page.context().newPage();
  await mailbox.goto("/dev/mail");
  const text = await mailbox.getByTestId("email").filter({ hasText: email }).first().innerText();
  await mailbox.close();
  const code = text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`No Email code was sent to ${email}`);
  return code;
}

/** Fills in the sign-in form and submits it, whatever the answer. */
export async function submitSignIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/sign-in");
  const button = page.getByRole("button", { name: "Sign in" });
  // Enabled once the page has hydrated and Turnstile has passed; filled sooner, it is emptied.
  await expect(button).toBeEnabled({ timeout: SUBMITTED_MS });
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await button.click();
}

/** Signs an Account in with its Email and password. */
export async function signIn(page: Page, account: { email: string; password: string }) {
  await submitSignIn(page, account);
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: SUBMITTED_MS });
}

export async function signOut(page: Page) {
  await page.goto("/account");
  await expect(async () => {
    await page.getByRole("button", { name: "Sign out" }).click({ timeout: 2000 });
    await expect(page).not.toHaveURL(/\/account/, { timeout: 2000 });
  }).toPass();
}

/** Signs the Admin in with an Email code, read from the local app's mail. */
export async function signInAdmin(page: Page, email: string) {
  await page.goto("/admin/sign-in");
  const code = page.getByLabel("Email code");
  await expect(async () => {
    // The last try sent the code, and the page asked for it after the try gave up.
    if (await code.isVisible()) return;
    // Filled before hydration it is emptied, so fill it until the code is asked for.
    await page.getByLabel("Email", { exact: true }).fill(email, { timeout: 2000 });
    await page.getByRole("button", { name: "Send my sign-in code" }).click({ timeout: 2000 });
    await expect(code).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: SUBMITTED_MS });
  await code.fill(await codeSentTo(page, email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: SUBMITTED_MS });
}
