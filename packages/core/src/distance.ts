import type { Metric } from './types.ts';

export type Distance = (a: number[], b: number[]) => number;

export function assertVector(v: number[], dims?: number) {
  if (
    !v.length ||
    (dims !== undefined && v.length !== dims) ||
    v.some((x) => !Number.isFinite(x) || Math.abs(x) > 1e6)
  ) {
    throw new Error(
      `Expected ${dims ?? 'a nonempty array of'} finite vector values (magnitude ≤ 1,000,000)`,
    );
  }
}

export const euclidean: Distance = (a, b) =>
  Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

export const manhattan: Distance = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);

export const cosine: Distance = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }

  return na < 1e-9 || nb < 1e-9
    ? 1
    : Math.max(0, Math.min(2, 1 - dot / (Math.sqrt(na) * Math.sqrt(nb))));
};

export const distances: Record<Metric, Distance> = {
  cosine,
  euclidean,
  manhattan,
};
