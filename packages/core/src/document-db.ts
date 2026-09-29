import type { Context, DocChunk } from "./types.ts";
import { assertVector, cosine } from "./distance.ts";
import { BruteForce } from "./brute-force.ts";
import { HNSW } from "./hnsw.ts";

export function chunkText(
  text: string,
  chunkWords = 250,
  overlapWords = 30,
): string[] {
  if (
    !Number.isInteger(chunkWords) ||
    !Number.isInteger(overlapWords) ||
    chunkWords < 1 ||
    overlapWords < 0 ||
    overlapWords >= chunkWords
  ) {
    throw new Error("Invalid chunk settings");
  }

  const words = text.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [];
  }

  if (words.length <= chunkWords) {
    return [text];
  }

  const chunks: string[] = [];

  for (
    let i = 0;
    i < words.length;
    i += chunkWords - overlapWords
  ) {
    chunks.push(
      words.slice(i, i + chunkWords).join(" "),
    );

    if (i + chunkWords >= words.length) {
      break;
    }
  }

  return chunks;
}

export class DocumentDB {
  private store = new Map<number, DocChunk>();
  private bf = new BruteForce();
  private hnsw = new HNSW("cosine");
  private nextId = 1;
  private nextDocumentId = 1;

  dims = 0;

  get size() {
    return this.store.size;
  }

  all() {
    return [...this.store.values()];
  }

  insertBatch(
    title: string,
    texts: string[],
    embeddings: number[][],
  ) {
    if (
      !texts.length ||
      texts.length !== embeddings.length
    ) {
      throw new Error("Invalid embedding batch");
    }

    const dims = this.dims || embeddings[0].length;

    // Validate the entire batch against the current store after all async work completes.
    for (const embedding of embeddings) {
      assertVector(embedding, dims);
    }

    const documentId = this.nextDocumentId++;
    const ids: number[] = [];

    this.dims = dims;

    texts.forEach((text, i) => {
      const id = this.nextId++;
      const chunkTitle =
        texts.length > 1
          ? `${title} [${i + 1}/${texts.length}]`
          : title;

      const chunk: DocChunk = {
        id,
        documentId,
        title: chunkTitle,
        text,
        embedding: [...embeddings[i]],
      };

      this.store.set(id, chunk);

      const item = {
        id,
        metadata: chunkTitle,
        category: "doc" as const,
        embedding: chunk.embedding,
      };

      this.bf.insert(item);
      this.hnsw.insert(item);
      ids.push(id);
    });

    return {
      ids,
      chunks: texts.length,
      dims,
      documentId,
    };
  }

  remove(id: number) {
    const chunk = this.store.get(id);

    if (!chunk) {
      return undefined;
    }

    this.store.delete(id);
    this.bf.remove(id);
    this.hnsw.remove(id);

    if (!this.size) {
      this.dims = 0;
    }

    return {
      documentId: chunk.documentId,
      lastChunk: !this.all().some(
        (c) => c.documentId === chunk.documentId,
      ),
    };
  }

  search(
    q: number[],
    k: number,
    maxDistance = 0.7,
  ): Context[] {
    if (!this.size) {
      return [];
    }

    assertVector(q, this.dims);

    const hits =
      this.size < 10
        ? this.bf.knn(q, k, cosine)
        : this.hnsw.knn(q, k);

    return hits
      .filter((h) => h.distance <= maxDistance)
      .map((h) => {
        const c = this.store.get(h.id)!;

        return {
          id: c.id,
          documentId: c.documentId,
          title: c.title,
          text: c.text,
          distance: h.distance,
        };
      });
  }

  summaries() {
    return this.all().map((c) => ({
      id: c.id,
      documentId: c.documentId,
      title: c.title,
      preview:
        c.text.slice(0, 120) +
        (c.text.length > 120 ? "…" : ""),
      words: c.text
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
    }));
  }
}