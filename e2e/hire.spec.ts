import { expect, test } from "@playwright/test";
import { seed, signIn } from "./support/helpers";

test("a Client Hires a Sent Quote through the fake checkout", async ({ page }) => {
  // A Client, and their Job with one Sent Quote.
  const { email, password, jobId } = seed<{ email: string; password: string; jobId: string }>(
    "hire",
  );

  await signIn(page, { email, password });
  await expect(page).toHaveURL(/\/jobs$/);

  await page.goto(`/jobs/${jobId}`);
  // A click before the page hydrates does nothing, so try until the Hire panel opens.
  await expect(async () => {
    await page.getByRole("button", { name: "Hire", exact: true }).click();
    await expect(page.getByText("Hire by paying for this Quote")).toBeVisible({ timeout: 1000 });
  }).toPass();
  const pay = page.getByRole("button", { name: /^Pay R/ });
  await expect(pay).toBeDisabled();
  await page.getByRole("checkbox", { name: /Protection Fee .* is not refunded/ }).click();
  await pay.click();

  await expect(page).toHaveURL(/\/fake-checkout\//);
  await expect(page.getByText("Fake checkout")).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "Pay", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`), { timeout: 2000 });
  }).toPass();

  await expect(page.getByText("Paid. Next: Work started")).toBeVisible();
  await expect(page.getByText("Hired", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Payments", { exact: true })).toBeVisible();
});
