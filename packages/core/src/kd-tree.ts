import type { Metric, Neighbor, VectorItem } from './types.ts';
import { distances } from './distance.ts';
import { Heap } from './heap.ts';
import { compareNeighbors } from './brute-force.ts';

interface Node {
  item: VectorItem;
  left?: Node;
  right?: Node;
  depth: number;
}

export class KDTree {
  private root?: Node;

  constructor(private dims: number) {}

  insert(item: VectorItem) {
    if (!this.root) {
      this.root = {
        item,
        depth: 0,
      };
      return;
    }

    let n = this.root;

    while (true) {
      const key =
        item.embedding[n.depth % this.dims] < n.item.embedding[n.depth % this.dims]
          ? 'left'
          : 'right';

      const next = n[key];

      if (next) {
        n = next;
      } else {
        n[key] = {
          item,
          depth: n.depth + 1,
        };
        return;
      }
    }
  }

  rebuild(items: VectorItem[]) {
    this.root = undefined;

    for (const item of items) {
      this.insert(item);
    }
  }

  knn(q: number[], k: number, metric: Metric): Neighbor[] {
    if (k <= 0 || !this.root) {
      return [];
    }

    const heap = new Heap<Neighbor>((a, b) => -compareNeighbors(a, b));

    // Deferred branches are evaluated after the near branch tightens the radius.
    const stack: { node: Node; bound: number }[] = [
      {
        node: this.root,
        bound: 0,
      },
    ];

    while (stack.length) {
      const { node: n, bound } = stack.pop()!;

      if (metric !== 'cosine' && heap.size >= k && bound > heap.peek().distance) {
        continue;
      }

      const hit = {
        id: n.item.id,
        distance: distances[metric](q, n.item.embedding),
      };

      if (heap.size < k || compareNeighbors(hit, heap.peek()) < 0) {
        heap.push(hit);

        if (heap.size > k) {
          heap.pop();
        }
      }

      const diff = q[n.depth % this.dims] - n.item.embedding[n.depth % this.dims];

      const near = diff < 0 ? n.left : n.right;
      const far = diff < 0 ? n.right : n.left;

      if (far) {
        stack.push({
          node: far,
          bound: Math.abs(diff),
        });
      }

      if (near) {
        stack.push({
          node: near,
          bound: 0,
        });
      }
    }

    return heap.values().sort(compareNeighbors);
  }
}
