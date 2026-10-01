import { expect, it } from 'vitest';
import { VectorDB } from '@vectordb/core';

it('restores saved IDs across all indexes without collisions', () => {
  const db = new VectorDB();
  const embedding = Array(16).fill(0.5);

  const restoredId = db.insert('Saved vector', 'cs', embedding, undefined, 42);

  expect(restoredId).toBe(42);

  for (const algorithm of ['bruteforce', 'kdtree', 'hnsw'] as const) {
    const result = db.search(embedding, 1, 'cosine', algorithm);
    expect(result.results[0].id).toBe(42);
  }

  expect(db.insert('Next vector', 'cs', embedding)).toBe(43);

  expect(() => db.insert('Duplicate', 'cs', embedding, undefined, 42)).toThrow('already exists');
});
