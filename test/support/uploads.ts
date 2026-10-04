import { assembleDomain, sections, type Actor } from "@/domain";
import { defineSection } from "@/domain/section";
import { ok } from "@/domain/result";
import { checkFileCount, uploadFile, type FileCountLimit, type StoredFile } from "@/domain/uploads";
import { createHarness } from "./harness";

// A probe section that calls the upload path the way Jobs, Completions, and
// Conversations will: it says whether Payment has happened, and counts what
// the thing it attaches to already holds before uploading more.

const uploadsProbe = defineSection({
  name: "uploadsProbe",
  api: (ctx) => {
    const held = new Map<string, StoredFile[]>();
    return {
      async upload(_actor: Actor, input: { file: Blob; afterPayment: boolean }) {
        return uploadFile(ctx, input.file, { afterPayment: input.afterPayment });
      },

      async attach(
        _actor: Actor,
        input: { to: string; limit: FileCountLimit; files: Blob[]; afterPayment: boolean },
      ) {
        const holding = held.get(input.to) ?? [];
        const counted = checkFileCount(input.limit, holding.length + input.files.length);
        if (!counted.ok) return counted;
        for (const file of input.files) {
          const stored = await uploadFile(ctx, file, { afterPayment: input.afterPayment });
          if (!stored.ok) return stored;
          holding.push(stored.value);
        }
        held.set(input.to, holding);
        return ok(holding.length);
      },
    };
  },
});

/** The harness with the uploads probe added, and a view of what R2 holds. */
export async function createUploadsHarness() {
  const harness = await createHarness();
  const domain = assembleDomain(harness.ports, [...sections, uploadsProbe]);
  async function stored() {
    const listed = await harness.files.list({ include: ["httpMetadata", "customMetadata"] });
    return listed.objects;
  }
  async function read(key: string) {
    const object = await harness.files.get(key);
    if (!object) throw new Error(`Nothing stored at ${key}`);
    return new Uint8Array(await object.arrayBuffer());
  }
  return { ...harness, domain, stored, read };
}
