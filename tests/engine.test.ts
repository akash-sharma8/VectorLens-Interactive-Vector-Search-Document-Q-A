import { describe, it, expect } from 'vitest';

import {
  VectorDB,
  DocumentDB,
  BruteForce,
  HNSW,
  KDTree,
  chunkText,
  cosine,
  distances,
} from '../packages/core/src/index.ts';

import type { Metric, VectorItem } from '../packages/core/src/types.ts';

import { DEMO_ITEMS, textToEmbedding } from '../packages/core/src/demo.ts';

import { pca2D } from '../packages/core/src/pca.ts';

const metrics: Metric[] = ['cosine', 'euclidean', 'manhattan'];

function random(seed = 13) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

    return seed / 4294967296;
  };
}

function fixture(n = 240, dims = 16) {
  const rng = random();

  return Array.from({ length: n }, (_, i): VectorItem => ({
    id: i + 1,
    category: 'cs',
    metadata: `item ${i}`,
    embedding: Array.from({ length: dims }, () => rng() * 4 - 2),
  }));
}

describe('distance and dataset parity', () => {
  it('copies every seed item and dimension', () => {
    expect(DEMO_ITEMS).toHaveLength(20);

    expect(DEMO_ITEMS.every((i) => i.embedding.length === 16)).toBe(true);

    expect(DEMO_ITEMS[0].embedding[0]).toBe(0.9);
  });

  it('has reference distances and zero-vector behavior', () => {
    expect(distances.euclidean([0, 0], [3, 4])).toBe(5);

    expect(distances.manhattan([0, 0], [3, 4])).toBe(7);

    expect(cosine([1, 0], [0, 1])).toBe(1);

    expect(cosine([1, 0], [-1, 0])).toBe(2);

    expect(cosine([0, 0], [1, 0])).toBe(1);
  });

  it('makes demo text repeatable and category-aware', () => {
    expect(textToEmbedding('binary tree')).toEqual(textToEmbedding('binary tree'));

    expect(textToEmbedding('sushi')[8]).toBeGreaterThan(0.7);

    expect(textToEmbedding('sushi')[0]).toBe(0.08);
  });
});

describe('nearest-neighbor algorithms', () => {
  for (const metric of metrics) {
    it(`${metric}: KD-Tree matches exhaustive reference for random and outside-range queries`, () => {
      const items = fixture();
      const tree = new KDTree(16);
      const bf = new BruteForce();

      items.forEach((i) => {
        tree.insert(i);
        bf.insert(i);
      });

      const queries = fixture(35).map((i) => i.embedding.map((v) => v * 2.4));

      for (const q of queries) {
        for (const k of [1, 7, 300]) {
          expect(tree.knn(q, k, metric)).toEqual(bf.knn(q, k, distances[metric]));
        }
      }
    });

    it(`${metric}: HNSW retrieves self, maintains useful recall, and has valid layers after deletion`, () => {
      const items = fixture();
      const h = new HNSW(metric);
      const bf = new BruteForce();

      items.forEach((i) => {
        h.insert(i);
        bf.insert(i);
      });

      let recall = 0;

      for (const item of items.slice(0, 30)) {
        const expected = new Set(bf.knn(item.embedding, 5, distances[metric]).map((h) => h.id));

        const result = h.knn(item.embedding, 5);

        expect(result[0].id).toBe(item.id);

        recall += result.filter((h) => expected.has(h.id)).length / 5;
      }

      expect(recall / 30).toBeGreaterThanOrEqual(0.9);

      const info = h.info();

      const highest = info.nodes.reduce((a, b) => (a.maxLyr > b.maxLyr ? a : b));

      h.remove(highest.id);

      expect(h.info().nodeCount).toBe(239);

      expect(h.info().edges.every((e) => e.src !== highest.id && e.dst !== highest.id)).toBe(true);

      expect(h.knn(items[1].embedding, 10).every((hit) => hit.id !== highest.id)).toBe(true);

      const nodes = new Map(h.info().nodes.map((n) => [n.id, n]));

      for (const edge of h.info().edges) {
        expect(nodes.get(edge.src)!.maxLyr).toBeGreaterThanOrEqual(edge.lyr);

        expect(nodes.get(edge.dst)!.maxLyr).toBeGreaterThanOrEqual(edge.lyr);
      }
    });
  }

  it('handles tied distances deterministically', () => {
    const db = new VectorDB(2);

    db.insert('a', 'cs', [1, 1]);

    db.insert('b', 'cs', [1, 1]);

    db.insert('c', 'cs', [1, 1]);

    for (const algo of ['hnsw', 'kdtree', 'bruteforce'] as const) {
      expect(db.search([1, 1], 2, 'cosine', algo).results.map((i) => i.id)).toEqual([1, 2]);
    }
  });

  it('can delete every vector, search empty indexes and reinsert', () => {
    const db = new VectorDB(2);

    for (let i = 0; i < 8; i++) {
      db.insert(String(i), 'cs', [i, 1]);
    }

    for (const item of db.all()) {
      expect(db.remove(item.id)).toBe(true);
    }

    for (const algo of ['hnsw', 'kdtree', 'bruteforce'] as const) {
      expect(db.search([1, 1], 5, 'cosine', algo).results).toEqual([]);
    }

    expect(db.info().topLayer).toBe(-1);

    db.insert('new', 'math', [1, 1]);

    expect(db.search([1, 1], 10).results).toHaveLength(1);
  });

  it('validates dimensions and nonfinite values', () => {
    const db = new VectorDB(2);

    expect(() => db.insert('bad', 'cs', [1])).toThrow();

    expect(() => db.insert('bad', 'cs', [1, Infinity])).toThrow();

    expect(() => db.search([1, 1], 0)).toThrow();
  });
});

describe('documents and visualization', () => {
  it('retains exact overlap and final short chunk', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`);

    const chunks = chunkText(words.join(' '));

    expect(chunks).toHaveLength(3);

    expect(chunks.map((c) => c.split(' ').length)).toEqual([250, 250, 60]);

    expect(chunks[1].split(' ')[0]).toBe('w220');

    expect(chunks[2].split(' ')[0]).toBe('w440');

    expect(chunkText('')).toEqual([]);

    expect(() => chunkText('test', 30, 30)).toThrow();
  });

  it('rejects an entire invalid batch before changing state', () => {
    const db = new DocumentDB();

    expect(() =>
      db.insertBatch(
        'test',
        ['one', 'two'],
        [
          [1, 0],
          [1, 0, 0],
        ],
      ),
    ).toThrow();

    expect(db.size).toBe(0);

    expect(db.dims).toBe(0);
  });

  it('filters irrelevant chunks, handles 10-chunk HNSW boundary, and resets dimensions when empty', () => {
    const db = new DocumentDB();

    const first = db.insertBatch(
      'notes',
      ['near', 'far'],
      [
        [1, 0],
        [-1, 0],
      ],
    );

    expect(db.search([1, 0], 5).map((c) => c.text)).toEqual(['near']);

    db.insertBatch(
      'more',
      Array(8).fill('same'),
      Array.from({ length: 8 }, () => [1, 0]),
    );

    expect(db.size).toBe(10);

    expect(db.search([1, 0], 20)).toHaveLength(9);

    expect(() => db.insertBatch('wrong', ['x'], [[1, 0, 0]])).toThrow();

    expect(db.size).toBe(10);

    expect(db.remove(first.ids[0])?.lastChunk).toBe(false);

    expect(db.remove(first.ids[1])?.lastChunk).toBe(true);

    for (const c of db.all()) {
      db.remove(c.id);
    }

    expect(db.dims).toBe(0);

    expect(db.insertBatch('new', ['x'], [[1, 0, 0]]).dims).toBe(3);
  });

  it('PCA handles empty, singleton and degenerate inputs without NaN', () => {
    expect(pca2D([])).toEqual([]);

    expect(pca2D([[1, 2]])).toEqual([[0, 0]]);

    for (const values of [
      [
        [1, 1],
        [1, 1],
      ],
      DEMO_ITEMS.map((i) => i.embedding),
    ]) {
      expect(pca2D(values).flat().every(Number.isFinite)).toBe(true);
    }
  });
});
