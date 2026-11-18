import { describe, expect, it } from 'vitest';
import { mergeCode, reviewCode, type CodeDraft } from '../apps/workbench/src/code-merge';

describe('code conflict review', () => {
  it('combines edits on separate original lines, including insertions and final-line changes', () => {
    expect(mergeCode(
      'one\ntwo\nthree\nfour\nfive',
      'one\nTWO\nthree\nadded\nfour\nfive',
      'ONE\ntwo\nthree\nfour\nFIVE',
    )).toBe('ONE\nTWO\nthree\nadded\nfour\nFIVE');
    expect(mergeCode('a\r\nb\r\nc\r\n', 'a\r\nc\r\n', 'a\r\nb\r\nC\r\n')).toBe('a\r\nC\r\n');
  });

  it('requires a decision for conflicting line edits or insertions at the same location', () => {
    expect(mergeCode('const v = 123;\n', 'const v = 423;\n', 'const v = 129;\n')).toBeNull();
    expect(mergeCode('a\nc\n', 'a\nsaved\nc\n', 'a\ndraft\nc\n')).toBeNull();
    expect(mergeCode('a\n', 'same\n', 'same\n')).toBe('same\n');
  });

  it('keeps an edited result available for comparison if the saved file changes again', () => {
    const path = 'src/artwork.ts';
    const draft: CodeDraft = { baseHash: '1', baseContent: 'a\nb\nc\n', content: 'a\nB\nc\n' };
    const first = reviewCode(draft, { path, hash: '2', content: 'a\nBB\nc\n' });
    expect(first).toMatchObject({ manual: true, comparison: draft.content, content: 'a\nBB\nc\n' });
    const second = reviewCode({ ...draft, review: { ...first, content: 'a\nresolved\nc\n' } },
      { path, hash: '3', content: 'a\nlatest\nc\n' });
    expect(second).toMatchObject({ manual: true, comparison: 'a\nresolved\nc\n', content: 'a\nlatest\nc\n' });
    const third = reviewCode({ ...draft, review: second }, { path, hash: '4', content: 'a\nBB\nC\n' });
    expect(third).toMatchObject({ manual: false, content: 'a\nresolved\nC\n' });
  });
});
