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

test("the Artisan proposes an Updated Quote, and the Client pays the difference through the fake checkout", async ({
  browser,
}) => {
  const { email, password, jobId, artisan } = seed<{
    email: string;
    password: string;
    jobId: string;
    artisan: { email: string; password: string };
  }>("hired");

  const asArtisan = await (await browser.newContext()).newPage();
  // Proposing asks to confirm.
  asArtisan.on("dialog", (dialog) => void dialog.accept());
  await signIn(asArtisan, artisan);
  await asArtisan.goto(`/jobs/${jobId}`);
  await expect(async () => {
    await asArtisan
      .getByRole("button", { name: "Propose an Updated Quote" })
      .click({ timeout: 2000 });
    await asArtisan.getByLabel("Labour").fill("1800", { timeout: 2000 });
    await asArtisan.getByLabel("Materials").fill("650", { timeout: 2000 });
    await asArtisan.getByRole("button", { name: "Propose", exact: true }).click({ timeout: 2000 });
    await expect(asArtisan.getByText(/It is waiting for the Client/)).toBeVisible({
      timeout: 2000,
    });
  }).toPass();

  const asClient = await (await browser.newContext()).newPage();
  await signIn(asClient, { email, password });
  await asClient.goto(`/jobs/${jobId}`);
  await expect(asClient.getByText(/The Artisan proposed it/)).toBeVisible();
  const pay = asClient.getByRole("button", { name: /^Pay R\s472,50$/ });
  await expect(pay).toBeDisabled();
  await expect(async () => {
    await asClient
      .getByRole("checkbox", { name: /Protection Fee .* is not refunded/ })
      .click({ timeout: 2000 });
    await expect(pay).toBeEnabled({ timeout: 2000 });
  }).toPass();
  await pay.click();

  await expect(asClient).toHaveURL(/\/fake-checkout\//);
  await expect(async () => {
    await asClient.getByRole("button", { name: "Pay", exact: true }).click();
    await expect(asClient).toHaveURL(new RegExp(`/jobs/${jobId}$`), { timeout: 2000 });
  }).toPass();

  await expect(asClient.getByText("Updated Quote accepted and paid")).toBeVisible();
  await expect(asClient.getByText(/^R\s1\s800,00$/)).toBeVisible();
  await expect(asClient.getByText(/^R\s650,00$/)).toBeVisible();
  await expect(asClient.getByText(/The Artisan proposed it/)).toHaveCount(0);

  await asArtisan.reload();
  await expect(asArtisan.getByText("Updated Quote accepted and paid")).toBeVisible();
  await expect(asArtisan.getByRole("button", { name: "Propose an Updated Quote" })).toBeVisible();
});
