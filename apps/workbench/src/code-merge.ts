import { Chunk } from '@codemirror/merge';
import { Text } from '@codemirror/state';
import type { SourceFile } from '@art/contracts';

export type CodeReview = {
  saved: SourceFile;
  comparisonBase: string;
  comparison: string;
  content: string;
  manual: boolean;
};

export type CodeDraft = {
  content: string;
  baseHash: string;
  baseContent: string;
  review?: CodeReview;
};

export const codeDiffOptions = { scanLimit: 500, timeout: 75 };

export function mergeCode(base: string, saved: string, draft: string): string | null {
  if (draft === saved || draft === base) return saved;
  if (saved === base) return draft;

  const original = Text.of(base.split('\n'));
  const changes = (content: string) => Chunk.build(original, Text.of(content.split('\n')), codeDiffOptions);
  const savedChunks = changes(saved);
  const draftChunks = changes(draft);
  if ([...savedChunks, ...draftChunks].some(chunk => !chunk.precise)) return null;

  const parts: string[] = [];
  let offset = 0, a = 0, b = 0;
  const append = (chunk: Chunk, content: string) => {
    parts.push(base.slice(offset, chunk.fromA), content.slice(chunk.fromB, chunk.toB));
    offset = chunk.toA;
  };

  while (a < savedChunks.length || b < draftChunks.length) {
    const left = savedChunks[a];
    const right = draftChunks[b];
    // Require separate original lines, including the anchor of an inserted line.
    if (!right || (left && left.fromA < right.fromA && left.toA <= right.fromA)) {
      append(left, saved);
      a++;
    } else if (!left || (right.fromA < left.fromA && right.toA <= left.fromA)) {
      append(right, draft);
      b++;
    } else {
      return null;
    }
  }
  parts.push(base.slice(offset));
  return parts.join('');
}

export function reviewCode(draft: CodeDraft, saved: SourceFile): CodeReview {
  const previous = draft.review;
  const hasMergeEdits = previous && previous.content !== previous.saved.content;
  const base = hasMergeEdits ? previous.saved.content : previous?.comparisonBase ?? draft.baseContent;
  const comparison = hasMergeEdits ? previous.content : previous?.comparison ?? draft.content;
  const content = mergeCode(base, saved.content, comparison);
  return { saved, comparisonBase: base, comparison, content: content ?? saved.content, manual: content === null };
}
