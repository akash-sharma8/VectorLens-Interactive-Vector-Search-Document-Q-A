import type { GraphInfo, Metric, Neighbor, VectorItem } from './types.ts';
import { distances } from './distance.ts';
import { Heap } from './heap.ts';
import { compareNeighbors } from './brute-force.ts';

interface Node {
  item: VectorItem;
  level: number;
  neighbors: number[][];
}

/** Direct educational HNSW port with nearest-M selection, M0=2M and seeded levels. */
export class HNSW {
  private graph = new Map<number, Node>();
  private entry = -1;
  private top = -1;
  private seed = 42;

  constructor(
    private metric: Metric = 'cosine',
    private M = 16,
    private efBuild = 200,
  ) {}

  private level() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;

    return Math.min(32, Math.floor(-Math.log((this.seed + 1) / 4294967297) / Math.log(this.M)));
  }

  private searchLayer(q: number[], ep: number, ef: number, layer: number): Neighbor[] {
    const entry = this.graph.get(ep);

    if (!entry) {
      return [];
    }

    const dist = distances[this.metric];
    const start = {
      id: ep,
      distance: dist(q, entry.item.embedding),
    };

    const candidates = new Heap<Neighbor>(compareNeighbors);
    const found = new Heap<Neighbor>((a, b) => -compareNeighbors(a, b));

    const visited = new Set([ep]);

    candidates.push(start);
    found.push(start);

    while (candidates.size) {
      const current = candidates.pop()!;

      if (found.size >= ef && current.distance > found.peek().distance) {
        break;
      }

      for (const id of this.graph.get(current.id)?.neighbors[layer] ?? []) {
        if (visited.has(id)) {
          continue;
        }

        visited.add(id);

        const node = this.graph.get(id);

        if (!node) {
          continue;
        }

        const hit = {
          id,
          distance: dist(q, node.item.embedding),
        };

        if (found.size < ef || compareNeighbors(hit, found.peek()) < 0) {
          candidates.push(hit);
          found.push(hit);

          if (found.size > ef) {
            found.pop();
          }
        }
      }
    }

    return found.values().sort(compareNeighbors);
  }

  insert(item: VectorItem) {
    const level = this.level();

    this.graph.set(item.id, {
      item,
      level,
      neighbors: Array.from({ length: level + 1 }, () => []),
    });

    if (this.entry === -1) {
      this.entry = item.id;
      this.top = level;
      return;
    }

    let ep = this.entry;

    for (let l = this.top; l > level; l--) {
      ep = this.searchLayer(item.embedding, ep, 1, l)[0]?.id ?? ep;
    }

    for (let l = Math.min(level, this.top); l >= 0; l--) {
      const found = this.searchLayer(item.embedding, ep, this.efBuild, l);

      const max = l === 0 ? this.M * 2 : this.M;
      const selected = found.slice(0, max).map((x) => x.id);

      this.graph.get(item.id)!.neighbors[l] = selected;

      for (const id of selected) {
        const n = this.graph.get(id)!;
        const links = n.neighbors[l] ?? [];

        links.push(item.id);

        if (links.length > max) {
          n.neighbors[l] = links
            .map((i) => ({
              id: i,
              distance: distances[this.metric](n.item.embedding, this.graph.get(i)!.item.embedding),
            }))
            .sort(compareNeighbors)
            .slice(0, max)
            .map((x) => x.id);
        }
      }

      ep = found[0]?.id ?? ep;
    }

    if (level > this.top) {
      this.top = level;
      this.entry = item.id;
    }
  }

  knn(q: number[], k: number, ef = 50) {
    if (k <= 0 || this.entry === -1) {
      return [];
    }

    let ep = this.entry;

    for (let l = this.top; l > 0; l--) {
      ep = this.searchLayer(q, ep, 1, l)[0]?.id ?? ep;
    }

    return this.searchLayer(q, ep, Math.max(k, ef), 0).slice(0, k);
  }

  remove(id: number) {
    if (!this.graph.has(id)) {
      return;
    }

    // Rebuild the educational index to retain valid upper layers and connectivity.
    const remaining = [...this.graph.values()].filter((n) => n.item.id !== id).map((n) => n.item);

    this.graph.clear();
    this.entry = -1;
    this.top = -1;
    this.seed = 42;

    for (const item of remaining) {
      this.insert(item);
    }
  }

  info(): GraphInfo {
    const out: GraphInfo = {
      topLayer: this.top,
      nodeCount: this.graph.size,
      nodesPerLayer: Array(Math.max(1, this.top + 1)).fill(0),
      edgesPerLayer: Array(Math.max(1, this.top + 1)).fill(0),
      nodes: [],
      edges: [],
    };

    const seen = new Set<string>();

    for (const [id, n] of this.graph) {
      out.nodes.push({
        id,
        metadata: n.item.metadata,
        category: n.item.category,
        maxLyr: n.level,
      });

      for (let l = 0; l <= n.level; l++) {
        out.nodesPerLayer[l]++;

        for (const other of n.neighbors[l]) {
          const src = Math.min(id, other);
          const dst = Math.max(id, other);
          const key = `${l}:${src}:${dst}`;

          if (!seen.has(key)) {
            seen.add(key);
            out.edgesPerLayer[l]++;
            out.edges.push({
              src,
              dst,
              lyr: l,
            });
          }
        }
      }
    }

    return out;
  }
}
