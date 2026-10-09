import { expect, test } from "@playwright/test";
import { seed, signIn } from "./support/helpers";

test("a Client marks Work started, and approves the Artisan's Completion", async ({ page }) => {
  const { email, password, jobId, engagementId } = seed<{
    email: string;
    password: string;
    jobId: string;
    engagementId: string;
  }>("hired");
  // Work started and Approve each ask to confirm.
  page.on("dialog", (dialog) => void dialog.accept());

  await signIn(page, { email, password });
  await expect(page).toHaveURL(/\/jobs$/);

  // The seed's start date is 30 days out, so only the Client can mark Work started now.
  await page.goto(`/jobs/${jobId}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Work started", exact: true }).click();
    await expect(page.getByText("The Materials were released to the Artisan.")).toBeVisible({
      timeout: 2000,
    });
  }).toPass();

  seed("markedComplete", engagementId);
  await page.reload();
  await expect(page.getByText("The work is marked complete")).toBeVisible();
  await expect(page.getByText("Both walls have two coats, and the room is cleaned.")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /Approved by silence on/ })).toBeVisible();

  await expect(async () => {
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({
      timeout: 2000,
    });
  }).toPass();
  await expect(
    page.getByText("The work is approved, and the Labour was released to the Artisan."),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Released at Approval" }).getByText("Released", {
      exact: true,
    }),
  ).toBeVisible();
});
