import { expect, test } from "@playwright/test";
import { seed, signInAdmin } from "./support/helpers";

// Read-only: a suburb added or a rules version published can never be taken
// back, so this stops short of both, which the domain tests cover.

test("the Admin reads the figures, is asked again for a suburb that reads alike, and stops short of publishing rules", async ({
  page,
}) => {
  seed("hired");
  const { email } = seed<{ email: string }>("admin");
  await signInAdmin(page, email);

  await page.getByRole("link", { name: "Figures" }).click();
  await expect(page.getByRole("heading", { name: "Figures" })).toBeVisible();
  await expect(page.getByText(/^Since /)).toBeVisible();
  await expect(page.getByText(/^\d+ of \d+ Hires are Completed\.$/)).toBeVisible();
  await page.getByRole("link", { name: "All time" }).click();
  await expect(page).toHaveURL(/period=all/);
  await expect(page.getByText("Since the start")).toBeVisible();

  await page.getByRole("link", { name: "Suburbs" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Sea Point");
  await page.getByLabel("Region", { exact: true }).selectOption({ label: "Southern" });
  await page.getByRole("button", { name: "Add the suburb" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "SEA POINT is already a suburb, in Table Bay. A suburb is never moved or renamed.",
  );
  await page.getByLabel("Name", { exact: true }).fill("BO KAAP");
  await page.getByLabel("Region", { exact: true }).selectOption({ label: "Table Bay" });
  await page.getByRole("button", { name: "Add the suburb" }).click();
  await expect(page.getByRole("alert")).toContainText("BO KAAP reads like BO-KAAP (Table Bay).");
  await expect(page.getByRole("button", { name: "Add it anyway" })).toBeVisible();

  await page.getByRole("link", { name: "Rules" }).click();
  await expect(page.getByText(/Accounts have accepted it\.$/)).toBeVisible();
  await page.getByLabel("What changed").fill("Fees are now shown in bold.");
  await page.getByRole("button", { name: /^Publish version \d+$/ }).click();
  await expect(page.getByText(/Every Account is told at once/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: /^Publish version \d+$/ })).toBeVisible();
});
