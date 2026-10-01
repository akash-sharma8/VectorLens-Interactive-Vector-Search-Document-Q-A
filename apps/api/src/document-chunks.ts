export interface SourcePage {
  pageNumber: number;
  text: string;
}

export interface PreparedChunk {
  chunkIndex: number;
  text: string;
  wordCount: number;
  pageStart: number | null;
  pageEnd: number | null;
}

export function prepareChunks(
  text: string,
  pages?: SourcePage[],
  chunkWords = 250,
  overlapWords = 30,
): PreparedChunk[] {
  if (
    !Number.isInteger(chunkWords) ||
    !Number.isInteger(overlapWords) ||
    chunkWords < 1 ||
    overlapWords < 0 ||
    overlapWords >= chunkWords
  ) {
    throw new Error('Invalid chunk settings.');
  }

  const words: {
    value: string;
    pageNumber: number | null;
  }[] = [];

  if (pages !== undefined) {
    let previousPage = 0;

    for (const page of pages) {
      if (!Number.isInteger(page.pageNumber) || page.pageNumber <= previousPage) {
        throw new Error('PDF page numbers must be positive and increasing.');
      }

      previousPage = page.pageNumber;

      for (const word of page.text.trim().split(/\s+/).filter(Boolean)) {
        words.push({
          value: word,
          pageNumber: page.pageNumber,
        });
      }
    }
  } else {
    // Pasted text has no PDF page references.
    for (const word of text.trim().split(/\s+/).filter(Boolean)) {
      words.push({
        value: word,
        pageNumber: null,
      });
    }
  }

  const chunks: PreparedChunk[] = [];
  const step = chunkWords - overlapWords;

  for (let start = 0; start < words.length; start += step) {
    const selected = words.slice(start, start + chunkWords);

    chunks.push({
      chunkIndex: chunks.length,
      text: selected.map((word) => word.value).join(' '),
      wordCount: selected.length,
      pageStart: selected[0].pageNumber,
      pageEnd: selected[selected.length - 1].pageNumber,
    });

    if (start + chunkWords >= words.length) {
      break;
    }
  }

  return chunks;
}
