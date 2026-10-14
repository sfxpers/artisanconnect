import type { ContentReader, ContentToRead, ContentVerdict } from "@/domain/ports";

type FakeContentReader = ContentReader & {
  /** Everything it was asked to read, oldest first. */
  readonly reads: ContentToRead[];
  /** Every read from now on gets this verdict. Starts as clear. */
  force(verdict: ContentVerdict): void;
  /** A read whose text holds this gets this verdict instead, whatever is forced. */
  forceWhen(text: string, verdict: ContentVerdict): void;
  /** Every photo from now on holds this text. Starts as none. */
  photosSay(text: string): void;
  /** Every voice note from now on says this. Starts as nothing. */
  voiceNotesSay(text: string): void;
  /** Every call from now on throws, as Workers AI does when it is down. */
  breaks(): void;
};

/**
 * `pagesOf` gives a PDF's pages, as the test that wrote it knows them, or
 * null for one it cannot read.
 */
export function createFakeContentReader(
  pagesOf: (pdf: Uint8Array) => string[] | null = () => null,
): FakeContentReader {
  let verdict: ContentVerdict = { kind: "clear" };
  const when: { text: string; verdict: ContentVerdict }[] = [];
  let photoText = "";
  let voiceNoteText = "";
  let broken = false;
  const reads: ContentToRead[] = [];
  const working = () => {
    if (broken) throw new Error("The fake content reader is down.");
  };
  return {
    reads,
    force(next) {
      verdict = next;
    },
    forceWhen(text, next) {
      when.push({ text, verdict: next });
    },
    photosSay(text) {
      photoText = text;
    },
    voiceNotesSay(text) {
      voiceNoteText = text;
    },
    breaks() {
      broken = true;
    },
    async readPhoto() {
      working();
      return photoText;
    },
    async transcribe() {
      working();
      return voiceNoteText;
    },
    async readPdf(pdf) {
      working();
      const pages = pagesOf(pdf);
      if (!pages) throw new Error("The fake content reader reads only the PDFs the tests wrote.");
      return pages;
    },
    async read(content) {
      working();
      reads.push(content);
      return when.find((each) => content.text.includes(each.text))?.verdict ?? verdict;
    },
  };
}
