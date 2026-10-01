export function pca2D(embeddings: number[][]): [number, number][] {
  const n = embeddings.length;

  if (!n) {
    return [];
  }

  if (n === 1) {
    return [[0, 0]];
  }

  const d = embeddings[0].length;
  const mean = Array(d).fill(0);

  // mean  of every rows
  for (const row of embeddings) {
    for (let j = 0; j < d; j++) {
      mean[j] += row[j] / n;
    }
  }

  // subtract mean from every row or centering
  const x = embeddings.map((row) => row.map((v, j) => v - mean[j]));

  function component(exclude?: number[]) {
    let v = Array.from({ length: d }, (_, i) => Math.sin((i + 1) * 1.37));

    for (let iter = 0; iter < 200; iter++) {
      const next = Array(d).fill(0);

      for (const row of x) {
        const dot = row.reduce((s, a, j) => s + a * v[j], 0);

        for (let j = 0; j < d; j++) {
          next[j] += row[j] * dot;
        }
      }

      if (exclude) {
        const dot = next.reduce((s, a, j) => s + a * exclude[j], 0);

        for (let j = 0; j < d; j++) {
          next[j] -= dot * exclude[j];
        }
      }

      const norm = Math.hypot(...next);

      if (norm < 1e-10) {
        return Array(d).fill(0);
      }

      const normalized = next.map((a) => a / norm);
      const change = normalized.reduce((s, a, j) => s + (a - v[j]) ** 2, 0);

      v = normalized;

      if (change < 1e-12) {
        break;
      }
    }

    return v;
  }

  const p1 = component();
  const p2 = component(p1);

  return x.map((row) => [
    row.reduce((s, a, j) => s + a * p1[j], 0),
    row.reduce((s, a, j) => s + a * p2[j], 0),
  ]);
}
