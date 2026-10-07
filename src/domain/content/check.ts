import type { Context } from "../context";
import type { ContentContext, ContentVerdict } from "../ports";
import { ok, refuse, type Result } from "../result";
import type { StoredFile } from "../uploads";
import { Locked } from "../uploads/bytes";
import { pdfText } from "../uploads/pdf";
import {
  patternHit,
  patternMessage,
  withheldHit,
  withheldMessage,
  type Withheld,
} from "./patterns";

// The Content check (ADR 0011): everything sent is read before anyone sees
// it. Photos are read by OCR, voice notes turned into text, and PDFs have
// their text extracted, so everything becomes text. Patterns then refuse what
// is certain, free and at once; the content reader reads for the rest. A sure
// hit is refused with the reason, and counts toward nothing: the check writes
// nothing. An unsure result, or a check that cannot run, Holds the item.

export type ContentToCheck = {
  /** The item's own text: a message, a description, an Account's names. */
  text: string;
  /** The files sent with it, as the upload path stored them. */
  files?: readonly StoredFile[];
  /** Before Payment, or after it inside one Engagement's Conversation (#104). */
  context: ContentContext;
  /** Before Payment, what a Conversation must not be told: its Job's address, and surnames. */
  withheld?: Withheld;
};

export type Checked =
  /** It may go out. */
  | { verdict: "clear"; text: string }
  /**
   * It waits for the Admin's Pre-check, and the reason is shown to the Admin,
   * with the text read from its files, which the Admin cannot read at a
   * glance (a voice note's above all).
   */
  | { verdict: "held"; reason: string; text: string; filesText: string };

/**
 * Reads what is sent. A sure hit is a refusal saying what to take out; the
 * sender keeps the draft, and nothing is recorded. Otherwise it is clear or
 * Held, with everything that was read as `text`.
 */
export async function checkContent(
  ctx: Context,
  item: ContentToCheck,
): Promise<Result<Checked, "content">> {
  const read = await readFiles(ctx, item.files ?? []);
  const filesText = read.texts.filter((part) => part.trim()).join("\n\n");
  const text = [item.text, filesText].filter((part) => part.trim()).join("\n\n");

  const hit = patternHit(text, item.context);
  if (hit) return refuse("content", patternMessage(hit));
  const withheld = item.context.kind === "before-payment" && withheldHit(text, item.withheld ?? {});
  if (withheld) return refuse("content", withheldMessage(withheld));
  if (read.unread) return ok({ verdict: "held", reason: read.unread, text, filesText });

  let verdict: ContentVerdict;
  try {
    verdict = await ctx.ports.contentReader.read({
      text,
      photos: read.photos,
      context: item.context,
    });
  } catch (error) {
    console.error("The content reader did not run", error);
    verdict = { kind: "cannot-run", reason: "The content reader did not answer." };
  }
  switch (verdict.kind) {
    case "clear":
      return ok({ verdict: "clear", text });
    case "sure-hit":
      return refuse("content", verdict.reason);
    case "unsure":
    case "cannot-run":
      return ok({ verdict: "held", reason: verdict.reason, text, filesText });
  }
}

/**
 * The text in each file, and the photos to look at. A file that cannot be
 * read leaves the check unable to run, which Holds the item: what nobody read
 * does not go out.
 */
export async function readFiles(ctx: Context, files: readonly StoredFile[]) {
  const texts: string[] = [];
  const photos: Uint8Array[] = [];
  let unread: string | null = null;
  for (const file of files) {
    try {
      const object = await ctx.ports.files.get(file.key);
      if (!object) throw new Error(`Nothing is stored at ${file.key}`);
      const bytes = new Uint8Array(await object.arrayBuffer());
      switch (file.kind) {
        case "photo":
          photos.push(bytes);
          texts.push(await ctx.ports.contentReader.readPhoto(bytes));
          break;
        case "voice-note":
          texts.push(
            await ctx.ports.contentReader.transcribe({
              bytes,
              contentType: object.httpMetadata?.contentType ?? "audio/webm",
            }),
          );
          break;
        case "pdf": {
          const pdf = await pdfText(bytes);
          // A scanned page is a picture of text, which text extraction cannot read.
          if (pdf.scannedPages > 0) unread ??= "A PDF with scanned pages cannot be read.";
          texts.push(pdf.text);
          break;
        }
      }
    } catch (error) {
      if (!(error instanceof Locked)) console.error(`File ${file.key} could not be read`, error);
      unread ??= `A ${FILE_NAMES[file.kind]} could not be read.`;
    }
  }
  return { texts, photos, unread };
}

const FILE_NAMES: Record<StoredFile["kind"], string> = {
  photo: "photo",
  "voice-note": "voice note",
  pdf: "PDF",
};
