import type { ContentReader, ContentToRead, ContentVerdict } from "../ports";

export type FakeContentReader = ContentReader & {
  /** Everything it was asked to read, oldest first. */
  readonly reads: ContentToRead[];
  /** Every read from now on gets this verdict. Starts as clear. */
  force(verdict: ContentVerdict): void;
  /** Every photo from now on holds this text. Starts as none. */
  photosSay(text: string): void;
  /** Every voice note from now on says this. Starts as nothing. */
  voiceNotesSay(text: string): void;
  /** Every call from now on throws, as Workers AI does when it is down. */
  breaks(): void;
};

export function createFakeContentReader(): FakeContentReader {
  let verdict: ContentVerdict = { kind: "clear" };
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
    async read(content) {
      working();
      reads.push(content);
      return verdict;
    },
  };
}
