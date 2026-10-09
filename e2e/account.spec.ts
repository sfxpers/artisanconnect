import { expect, test } from "@playwright/test";
import { codeSentTo, seed, signIn, signInAdmin, submitSignIn } from "./support/helpers";

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
  // A Closed Account is refused at sign-in.
  await submitSignIn(asClient, { email: moved, password });
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
