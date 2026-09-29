import type { VectorItem, Neighbor } from './types.ts';
import type { Distance } from './distance.ts';


export const compareNeighbors = (
  a: Neighbor,
  b: Neighbor
) => a.distance - b.distance || a.id - b.id;


export class BruteForce {

  private items = new Map<number, VectorItem>();

  insert(item: VectorItem) {
    this.items.set(item.id, item);
  }
  remove(id: number) {
    this.items.delete(id);
  }

  knn(q: number[], k: number, dist: Distance): Neighbor[] {
    if (k <= 0) return [];
    return [...this.items.values()].map(v => ({ id: v.id, distance: dist(q, v.embedding) })).sort(compareNeighbors).slice(0, k);
  }
}
