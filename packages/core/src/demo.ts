import type { Category } from './types.ts';
export const DEMO_ITEMS: { metadata: string; category: Category; embedding: number[] }[] = [
  {
    metadata: 'Linked List: nodes connected by pointers',
    category: 'cs',
    embedding: [
      0.9, 0.85, 0.72, 0.68, 0.12, 0.08, 0.15, 0.1, 0.05, 0.08, 0.06, 0.09, 0.07, 0.11, 0.08, 0.06,
    ],
  },
  {
    metadata: 'Binary Search Tree: O(log n) search and insert',
    category: 'cs',
    embedding: [
      0.88, 0.82, 0.78, 0.74, 0.15, 0.1, 0.08, 0.12, 0.06, 0.07, 0.08, 0.05, 0.09, 0.06, 0.07, 0.1,
    ],
  },
  {
    metadata: 'Dynamic Programming: memoization overlapping subproblems',
    category: 'cs',
    embedding: [
      0.82, 0.76, 0.88, 0.8, 0.2, 0.18, 0.12, 0.09, 0.07, 0.06, 0.08, 0.07, 0.08, 0.09, 0.06, 0.07,
    ],
  },
  {
    metadata: 'Graph BFS and DFS: breadth and depth first traversal',
    category: 'cs',
    embedding: [
      0.85, 0.8, 0.75, 0.82, 0.18, 0.14, 0.1, 0.08, 0.06, 0.09, 0.07, 0.06, 0.1, 0.08, 0.09, 0.07,
    ],
  },
  {
    metadata: 'Hash Table: O(1) lookup with collision chaining',
    category: 'cs',
    embedding: [
      0.87, 0.78, 0.7, 0.76, 0.13, 0.11, 0.09, 0.14, 0.08, 0.07, 0.06, 0.08, 0.07, 0.1, 0.08, 0.09,
    ],
  },
  {
    metadata: 'Calculus: derivatives integrals and limits',
    category: 'math',
    embedding: [
      0.12, 0.15, 0.18, 0.1, 0.91, 0.86, 0.78, 0.72, 0.08, 0.06, 0.07, 0.09, 0.07, 0.08, 0.06, 0.1,
    ],
  },
  {
    metadata: 'Linear Algebra: matrices eigenvalues eigenvectors',
    category: 'math',
    embedding: [
      0.2, 0.18, 0.15, 0.12, 0.88, 0.9, 0.82, 0.76, 0.09, 0.07, 0.08, 0.06, 0.1, 0.07, 0.08, 0.09,
    ],
  },
  {
    metadata: 'Probability: distributions random variables Bayes theorem',
    category: 'math',
    embedding: [
      0.15, 0.12, 0.2, 0.18, 0.84, 0.8, 0.88, 0.82, 0.07, 0.08, 0.06, 0.1, 0.09, 0.06, 0.09, 0.08,
    ],
  },
  {
    metadata: 'Number Theory: primes modular arithmetic RSA cryptography',
    category: 'math',
    embedding: [
      0.22, 0.16, 0.14, 0.2, 0.8, 0.85, 0.76, 0.9, 0.08, 0.09, 0.07, 0.06, 0.08, 0.1, 0.07, 0.06,
    ],
  },
  {
    metadata: 'Combinatorics: permutations combinations generating functions',
    category: 'math',
    embedding: [
      0.18, 0.2, 0.16, 0.14, 0.86, 0.78, 0.84, 0.8, 0.06, 0.07, 0.09, 0.08, 0.06, 0.09, 0.1, 0.07,
    ],
  },
  {
    metadata: 'Neapolitan Pizza: wood-fired dough San Marzano tomatoes',
    category: 'food',
    embedding: [
      0.08, 0.06, 0.09, 0.07, 0.07, 0.08, 0.06, 0.09, 0.9, 0.86, 0.78, 0.72, 0.08, 0.06, 0.09, 0.07,
    ],
  },
  {
    metadata: 'Sushi: vinegared rice raw fish and nori rolls',
    category: 'food',
    embedding: [
      0.06, 0.08, 0.07, 0.09, 0.09, 0.06, 0.08, 0.07, 0.86, 0.9, 0.82, 0.76, 0.07, 0.09, 0.06, 0.08,
    ],
  },
  {
    metadata: 'Ramen: noodle soup with chashu pork and soft-boiled eggs',
    category: 'food',
    embedding: [
      0.09, 0.07, 0.06, 0.08, 0.08, 0.09, 0.07, 0.06, 0.82, 0.78, 0.9, 0.84, 0.09, 0.07, 0.08, 0.06,
    ],
  },
  {
    metadata: 'Tacos: corn tortillas with carnitas salsa and cilantro',
    category: 'food',
    embedding: [
      0.07, 0.09, 0.08, 0.06, 0.06, 0.07, 0.09, 0.08, 0.78, 0.82, 0.86, 0.9, 0.06, 0.08, 0.07, 0.09,
    ],
  },
  {
    metadata: 'Croissant: laminated pastry with buttery flaky layers',
    category: 'food',
    embedding: [
      0.06, 0.07, 0.1, 0.09, 0.1, 0.06, 0.07, 0.1, 0.85, 0.8, 0.76, 0.82, 0.09, 0.07, 0.1, 0.06,
    ],
  },
  {
    metadata: 'Basketball: fast-paced shooting dribbling slam dunks',
    category: 'sports',
    embedding: [
      0.09, 0.07, 0.08, 0.1, 0.08, 0.09, 0.07, 0.06, 0.08, 0.07, 0.09, 0.06, 0.91, 0.85, 0.78, 0.72,
    ],
  },
  {
    metadata: 'Football: tackles touchdowns field goals and strategy',
    category: 'sports',
    embedding: [
      0.07, 0.09, 0.06, 0.08, 0.09, 0.07, 0.1, 0.08, 0.07, 0.09, 0.08, 0.07, 0.87, 0.89, 0.82, 0.76,
    ],
  },
  {
    metadata: 'Tennis: racket volleys groundstrokes and Wimbledon serves',
    category: 'sports',
    embedding: [
      0.08, 0.06, 0.09, 0.07, 0.07, 0.08, 0.06, 0.09, 0.09, 0.06, 0.07, 0.08, 0.83, 0.8, 0.88, 0.82,
    ],
  },
  {
    metadata: 'Chess: openings endgames tactics strategic board game',
    category: 'sports',
    embedding: [
      0.25, 0.2, 0.22, 0.18, 0.22, 0.18, 0.2, 0.15, 0.06, 0.08, 0.07, 0.09, 0.8, 0.84, 0.78, 0.9,
    ],
  },
  {
    metadata: 'Swimming: butterfly freestyle backstroke Olympic competition',
    category: 'sports',
    embedding: [
      0.06, 0.08, 0.07, 0.09, 0.08, 0.06, 0.09, 0.07, 0.1, 0.08, 0.06, 0.07, 0.85, 0.82, 0.86, 0.8,
    ],
  },
];
const KW: Record<string, string[]> = {
  cs: [
    'algorithm',
    'data',
    'tree',
    'graph',
    'array',
    'linked',
    'hash',
    'stack',
    'queue',
    'sort',
    'binary',
    'dynamic',
    'programming',
    'recursion',
    'complexity',
    'pointer',
    'node',
    'search',
    'insert',
    'bfs',
    'dfs',
    'heap',
    'trie',
  ],
  math: [
    'calculus',
    'matrix',
    'probability',
    'theorem',
    'integral',
    'derivative',
    'linear',
    'algebra',
    'equation',
    'function',
    'prime',
    'modular',
    'combinatorics',
    'permutation',
    'eigenvalue',
    'statistics',
    'proof',
  ],
  food: [
    'food',
    'pizza',
    'sushi',
    'ramen',
    'pasta',
    'recipe',
    'cook',
    'eat',
    'restaurant',
    'dish',
    'ingredient',
    'flavor',
    'spice',
    'noodle',
    'bread',
    'croissant',
    'taco',
    'fish',
    'rice',
    'soup',
  ],
  sports: [
    'sport',
    'basketball',
    'football',
    'tennis',
    'chess',
    'swim',
    'game',
    'play',
    'score',
    'team',
    'athlete',
    'competition',
    'match',
    'tournament',
    'olympic',
    'dribble',
    'tackle',
    'serve',
  ],
};
/** Synthetic category features for the demo map; not model embeddings. */
export function textToEmbedding(text: string): number[] {
  const scores: Record<string, number> = {
    cs: 0,
    math: 0,
    food: 0,
    sports: 0,
  };

  for (const word of text.toLowerCase().split(/\s+/).filter(Boolean)) {
    for (const [cat, words] of Object.entries(KW)) {
      if (words.some((kw) => word.includes(kw) || kw.startsWith(word))) {
        scores[cat] += 0.35;
      }
    }
  }

  const max = Math.max(...Object.values(scores), 0.01);

  const embedding = Array(16).fill(0.08);

  // Seeded jitter makes identical text reproducible across requests and benchmarks.
  let seed = 2166136261;

  for (const char of text.toLowerCase()) {
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  }

  const jitter = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

    return (seed / 4294967296 - 0.5) * 0.04;
  };

  Object.values(scores).forEach((score, group) => {
    if (score < 0.01) {
      return;
    }

    const base = Math.min((score / max) * 0.88, 0.94);

    [1, 1, 0.92, 0.87].forEach((factor, i) => {
      embedding[group * 4 + i] = Math.max(0.05, base * factor + jitter());
    });
  });

  return embedding;
}
