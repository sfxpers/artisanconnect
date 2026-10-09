import { expect, test } from "@playwright/test";
import { codeSentTo } from "./support/helpers";

test("a Visitor signs up as a Client and lands ready to post a Job", async ({ page }) => {
  const email = `client-${Date.now()}@example.com`;

  await page.goto("/");
  await page.getByRole("navigation").getByRole("link", { name: "Sign up" }).click();

  // A click before the page hydrates does nothing, so try until the next row opens.
  await expect(async () => {
    await page.getByRole("button", { name: /I need work done/ }).click();
    await expect(page.getByLabel("Full name")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.getByLabel("Full name").fill("Thandi Mokoena");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: /I accept the Marketplace rules/ }).click();
  await page.getByRole("checkbox", { name: /outside South Africa/ }).click();
  const send = page.getByRole("button", { name: "Send my Email code" });
  await expect(send).toBeEnabled({ timeout: 30_000 }); // once Turnstile has passed
  await send.click();

  await expect(page).toHaveURL(/\/confirm-email/);
  await page.getByLabel("Email code").fill(await codeSentTo(page, email));
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByText("Post your first Job")).toBeVisible();
  const header = page.getByRole("navigation", { name: "Main" });
  await expect(header.getByRole("link")).toHaveText(["Jobs", "Find Artisans", "Account"]);
});
