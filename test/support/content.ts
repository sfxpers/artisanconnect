import { assembleDomain, sections, type Actor, type ContentContext } from "@/domain";
import { checkContent } from "@/domain/content/check";
import { defineSection } from "@/domain/section";
import { UPLOAD_CONTEXTS, uploadFile, type StoredFile } from "@/domain/uploads";
import { createHarness, TEST_CONFIG } from "./harness";

// A probe section that sends content the way Jobs, Quotes, and messages will:
// it uploads the files first, then checks the text with them, in a context.

const contentProbe = defineSection({
  name: "contentProbe",
  api: (ctx) => ({
    async send(_actor: Actor, input: { text: string; files?: Blob[]; context: ContentContext }) {
      const stored: StoredFile[] = [];
      for (const file of input.files ?? []) {
        const uploaded = await uploadFile(ctx, file, UPLOAD_CONTEXTS.afterPayment);
        if (!uploaded.ok) throw new Error(uploaded.refusal.message);
        stored.push(uploaded.value);
      }
      return checkContent(ctx, { text: input.text, files: stored, context: input.context });
    },
  }),
});

/** The harness with the content probe added. */
export async function createContentHarness() {
  const harness = await createHarness();
  return {
    ...harness,
    domain: assembleDomain(harness.ports, TEST_CONFIG, [...sections, contentProbe]),
  };
}
