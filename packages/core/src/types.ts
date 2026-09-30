export type Metric = "cosine" | "euclidean" | "manhattan";

export type Algorithm = "bruteforce" | "kdtree" | "hnsw";

export type Category = "cs" | "math" | "food" | "sports" | "doc";

export interface VectorItem {
  id: number;
  metadata: string;
  category: Category;
  embedding: number[];
  documentId?: number;
}

export interface Hit extends VectorItem {
  distance: number;
}

export interface SearchResult {
  results: Hit[];
  latencyUs: number;
  algo: Algorithm;
  metric: Metric;
}

export interface Neighbor {
  id: number;
  distance: number;
}

export interface GraphInfo {
  topLayer: number;
  nodeCount: number;
  nodesPerLayer: number[];
  edgesPerLayer: number[];
  nodes: {
    id: number;
    metadata: string;
    category: Category;
    maxLyr: number;
  }[];
  edges: {
    src: number;
    dst: number;
    lyr: number;
  }[];
}

export interface DocChunk {
  id: number;
  documentId: number;
  title: string;
  text: string;
  embedding: number[];
}

export interface DocSummary {
  id: number;
  documentId: number;
  title: string;
  preview: string;
  words: number;

  pageStart?: number | null;
  pageEnd?: number | null;
}

export interface Context {
  id: number;
  documentId: number;
  title: string;
  text: string;
  distance: number;

  pageStart?: number | null;
  pageEnd?: number | null;
}

export interface Answer {
  answer: string;
  model: string;
  contexts: Context[];
  docCount: number;

  documentsOnly?: boolean;
  generated?: boolean;
}

export interface Status {
  ollamaAvailable: boolean;
  modelsReady: boolean;
  embedModel: string;
  genModel: string;
  missingModels: string[];
  docCount: number;
  docDims: number;
  demoDims: number;
  demoCount: number;
}

export interface Benchmark {
  bruteforceUs: number;
  kdtreeUs: number;
  hnswUs: number;
  itemCount: number;
}