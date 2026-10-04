import type { ContentReader, ContentToRead, ContentVerdict } from "../ports";

export type FakeContentReader = ContentReader & {
  /** Everything it was asked to read, oldest first. */
  readonly reads: ContentToRead[];
  /** Every read from now on gets this verdict. Starts as clear. */
  force(verdict: ContentVerdict): void;
};

export function createFakeContentReader(): FakeContentReader {
  let verdict: ContentVerdict = { kind: "clear" };
  const reads: ContentToRead[] = [];
  return {
    reads,
    force(next) {
      verdict = next;
    },
    async read(content) {
      reads.push(content);
      return verdict;
    },
  };
}
