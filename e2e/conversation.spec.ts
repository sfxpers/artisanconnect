import { expect, test } from "@playwright/test";
import { seed, signIn } from "./support/helpers";

test("the Engagement's Conversation shows the Hire, voice notes, and PDFs, and takes a phone number", async ({
  page,
}) => {
  const { email, password, jobId, engagementId } = seed<{
    email: string;
    password: string;
    jobId: string;
    engagementId: string;
  }>("hired");
  const { conversationId } = seed<{ conversationId: string }>("engagementMessage", engagementId);

  await signIn(page, { email, password });
  await expect(page).toHaveURL(/\/jobs$/);

  await page.goto(`/jobs/${jobId}?tab=messages&conversation=${conversationId}`);
  await expect(page.getByText(/Hired and paid ·/)).toBeVisible();
  await expect(
    page.getByText("Call me on 082 555 1234 when you're home.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Voice note, 0:12")).toBeVisible();
  const pdf = page.getByRole("link", { name: "PDF 1" });
  await expect(pdf).toBeVisible();
  expect(
    (await page.request.get((await pdf.getAttribute("href"))!)).headers()["content-type"],
  ).toBe("application/pdf");
  // Safari plays a voice note only from a server that serves part of it.
  const voiceNote = (await page.locator("audio").first().getAttribute("src"))!;
  const part = await page.request.get(voiceNote, { headers: { range: "bytes=0-1" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toMatch(/^bytes 0-1\/\d+$/);
  expect((await part.body()).length).toBe(2);
  await expect(page.getByRole("button", { name: "Record a voice note" })).toBeVisible();

  // The local app cannot reach Workers AI, so what passes the patterns is Held, not refused.
  await expect(async () => {
    await page.getByPlaceholder("Write a message").fill("Mine is 083 444 5678.");
    // Filled before the page has hydrated, the draft is emptied and Send stays disabled.
    await page.getByRole("button", { name: "Send", exact: true }).click({ timeout: 2000 });
    await expect(page.getByText("Being checked")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await expect(page.getByText("Take out the phone number.", { exact: false })).toHaveCount(0);
});
