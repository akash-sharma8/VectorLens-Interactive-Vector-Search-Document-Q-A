import { describe, expect, it } from 'vitest';
import { prepareChunks } from '../apps/api/src/document-chunks.ts';

describe('Document chunk page references', () => {
  it('preserves overlap and page numbers across an empty page', () => {
    const chunks = prepareChunks(
      '',
      [
        { pageNumber: 1, text: 'A B C' },
        { pageNumber: 2, text: '' },
        { pageNumber: 3, text: 'D E F' },
      ],
      4,
      1
    );

    expect(chunks).toEqual([
      {
        chunkIndex: 0,
        text: 'A B C D',
        wordCount: 4,
        pageStart: 1,
        pageEnd: 3,
      },
      {
        chunkIndex: 1,
        text: 'D E F',
        wordCount: 3,
        pageStart: 3,
        pageEnd: 3,
      },
    ]);
  });

  it('uses null page references for pasted text', () => {
    const chunks = prepareChunks('Hello world');

    expect(chunks[0].pageStart).toBeNull();
    expect(chunks[0].pageEnd).toBeNull();
    expect(chunks[0].wordCount).toBe(2);
  });

  it('does not create chunks from empty text', () => {
    expect(prepareChunks('   ')).toEqual([]);
  });
});