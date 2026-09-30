import type {
  Algorithm,
  Benchmark,
  Category,
  Metric,
  SearchResult,
  VectorItem,
} from "./types.ts";

import { assertVector, distances } from "./distance.ts";
import { BruteForce } from "./brute-force.ts";
import { KDTree } from "./kd-tree.ts";
import { HNSW } from "./hnsw.ts";

export class VectorDB {
  private store = new Map<number, VectorItem>();

  private bf = new BruteForce();

  private kd: KDTree;

  private graphs: Record<Metric, HNSW> = {
    cosine: new HNSW("cosine"),
    euclidean: new HNSW("euclidean"),
    manhattan: new HNSW("manhattan"),
  };

  private nextId = 1;

  constructor(readonly dims = 16) {
    this.kd = new KDTree(dims);
  }

  get size() {
    return this.store.size;
  }

  all() {
    return [...this.store.values()];
  }

insert(
  metadata: string,
  category: Category,
  embedding: number[],
  documentId?: number,
  persistedId?: number,
) {
  assertVector(embedding, this.dims);

  const id = persistedId ?? this.nextId;

  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Invalid vector ID.");
  }

  if (this.store.has(id)) {
    throw new Error(`Vector ID ${id} already exists.`);
  }

  const item: VectorItem = {
    id,
    metadata,
    category,
    embedding: [...embedding],

    ...(documentId !== undefined ? { documentId } : {}),
  };

  this.store.set(id, item);

  this.bf.insert(item);
  this.kd.insert(item);

  for (const graph of Object.values(this.graphs)) {
    graph.insert(item);
  }

  this.nextId = Math.max(this.nextId, id + 1);

  return id;
}

  remove(id: number) {
    if (!this.store.delete(id)) {
      return false;
    }

    this.bf.remove(id);
    this.kd.rebuild(this.all());

    for (const graph of Object.values(this.graphs)) {
      graph.remove(id);
    }

    return true;
  }

  search(
    q: number[],
    k: number,
    metric: Metric = "cosine",
    algo: Algorithm = "hnsw",
  ): SearchResult {
    assertVector(q, this.dims);

    if (!Number.isInteger(k) || k < 1) {
      throw new Error("k must be a positive integer");
    }

    const start = performance.now();

    const raw =
      algo === "bruteforce"
        ? this.bf.knn(q, k, distances[metric])
        : algo === "kdtree"
          ? this.kd.knn(q, k, metric)
          : this.graphs[metric].knn(q, k);

    const latencyUs = Math.max(0, (performance.now() - start) * 1000);

    return {
      results: raw.map((hit) => ({
        ...this.store.get(hit.id)!,
        distance: hit.distance,
      })),
      latencyUs,
      algo,
      metric,
    };
  }

  benchmark(q: number[], k: number, metric: Metric): Benchmark {
    const measure = (algo: Algorithm) => {
      for (let i = 0; i < 5; i++) {
        this.search(q, k, metric, algo);
      }

      const times = Array.from(
        { length: 21 },
        () => this.search(q, k, metric, algo).latencyUs,
      ).sort((a, b) => a - b);

      return times[10];
    };

    return {
      bruteforceUs: measure("bruteforce"),
      kdtreeUs: measure("kdtree"),
      hnswUs: measure("hnsw"),
      itemCount: this.size,
    };
  }

  info(metric: Metric = "cosine") {
    return this.graphs[metric].info();
  }
}