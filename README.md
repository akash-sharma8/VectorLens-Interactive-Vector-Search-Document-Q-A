# VectorDB — TypeScript migration

A runnable migration of the supplied **padhowithPratyush / VectorDB — HNSW + RAG** C++ and HTML project. The original dark dashboard, demo dataset, custom search algorithms, vector visualization, document chunking and local Ollama RAG workflow are preserved.

## Quick start

Requirements: **Node.js 22.14+** (Node 24 recommended), npm, and optionally Ollama for document/AI features.

From the extracted `vectordb-ts` folder:

```bash
npm ci
npm run dev
```

Open **http://localhost:3000**. The API runs at **http://127.0.0.1:8080**.

The 20-vector playground works immediately, even without Ollama. Search for `binary tree`, `calculus`, `sushi`, or `basketball`, switch algorithms/metrics, insert/delete vectors, and compare timings.

### Enable document search and Ask AI

Install [Ollama](https://ollama.com/download), start its desktop application or run `ollama serve`, and download the original models:

```bash
ollama pull nomic-embed-text
ollama pull llama3.2
```

Use **Documents → Refresh** to check availability. Enter a title and paste text, then choose **Embed & Insert**. In **Ask AI**, enter a question. Expand the context chips to inspect retrieved chunks.

The models run on the machine hosting Ollama. Model downloads and first inference can take time. No paid API key is required for this local-model configuration.

### Optional configuration

Defaults work without any `.env` files. To customize, copy:

- `apps/api/.env.example` → `apps/api/.env`
- `apps/web/.env.example` → `apps/web/.env.local`

API variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | API listener port |
| `HOST` | `127.0.0.1` | API listener host |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama address reachable by the API |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `OLLAMA_GEN_MODEL` | `llama3.2` | Generation model |
| `WEB_ORIGIN` | `http://localhost:3000` | Optional direct browser CORS origin |

The frontend's server-side `API_ORIGIN` defaults to `http://127.0.0.1:8080`. Browser requests go to the same-origin `/api/*` proxy. Rebuild the frontend after changing `API_ORIGIN` for production.

Do not mix embeddings from different models in a running document collection, even if dimensions match. Delete/reinsert documents after changing models.

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start both apps with reload |
| `npm run typecheck` | Check backend, core, tests and frontend TypeScript |
| `npm test` | Run engine, API and Ollama adapter tests |
| `npm run build` | Typecheck and create the production Next.js build |
| `npm start` | Start the API and production frontend after building |
| `npm run test:http` | Verify the production UI route, proxy and full document workflow using a test-only model fixture |
| `npm run test:browser` | Run browser tests against a clearly marked test-only Ollama fixture |

To run browser checks:

```bash
npx playwright install chromium
npm run build
npm run test:browser
```

On a minimal Linux system, use `npx playwright install --with-deps chromium` if browser system libraries are missing. Close development servers first: browser tests own ports 3000, 8080 and 11435. Test fixture responses are explicitly labeled and the fixture is never started by normal `dev` or `start` scripts.

## Architecture

| Directory | Responsibility |
| --- | --- |
| `apps/web/app` | Next.js entry points, original-theme CSS, responsive layout |
| `apps/web/components/Dashboard.tsx` | Search, documents, Ask AI and UI state |
| `apps/web/components/ScatterPlot.tsx` | Animated PCA canvas, tooltips, embedding bars |
| `apps/web/components/api.ts` | Same-origin API requests and error messages |
| `apps/api/src/app.ts` | Express routes, request validation and RAG orchestration |
| `apps/api/src/ollama.ts` | Typed Ollama adapter, timeouts and model availability |
| `apps/api/src/server.ts` | API startup and graceful shutdown |
| `packages/core/src` | Framework-independent vector engine and shared types |
| `tests` | Algorithm, API, adapter and browser verification |

The Express process owns the indexes. Synchronous index mutations finish before another request can modify them. Ollama I/O is asynchronous. For document ingestion, all embeddings are collected and validated before the document store is changed; no chunks become visible if a model request fails.

There are **two separate vector spaces**:

1. **Demo VectorDB:** 16D category vectors, seeded with the original 20 items. Query vectors come from a keyword-based feature function. Three metric-specific HNSW indexes share the same stored vectors.
2. **DocumentDB:** real Ollama embeddings of text chunks. Dimensions are learned from the first batch. It searches with cosine distance, using brute force for fewer than 10 chunks and HNSW otherwise, with a maximum cosine distance of 0.7.

When a document is inserted, the backend also creates one synthetic 16D visualization marker. All chunks share a `documentId`, and the marker has the same ID reference. The marker is removed when the last chunk of that document is deleted. Removing a marker from vector search only removes that marker, not the document chunks.

### Core modules

- `distance.ts`: cosine distance, Euclidean distance, Manhattan distance and vector validation.
- `heap.ts`: generic binary heap used by KD-Tree and HNSW.
- `brute-force.ts`: exhaustive sorted search with deterministic tie ordering.
- `kd-tree.ts`: insertion, iterative branch-and-bound search and rebuild.
- `hnsw.ts`: multilayer graph, greedy upper-layer traversal, candidate heaps and nearest-M pruning. Original defaults: M=16, M0=32, efConstruction=200, efSearch=50.
- `vector-db.ts`: coordinated indexes, item IDs, queries and benchmark measurement.
- `document-db.ts`: overlapping word chunker, atomic batch validation, document chunk storage and retrieval.
- `demo.ts`: original 20 items and keyword-based synthetic features.
- `pca.ts`: seeded 2D power-iteration projection for the visualization.

## HTTP API

Existing route names and successful response fields remain compatible. New `documentId` and `markerId` fields provide reliable relationships. Validation errors return non-2xx status codes and `{ "error": "..." }`.

| Method | Route | Request |
| --- | --- | --- |
| GET | `/items` | List demo vectors |
| POST | `/insert` | `{metadata, category, embedding: number[16]}` |
| DELETE | `/delete/:id` | Remove demo vector or map marker |
| GET | `/search` | `v=comma,separated,vector&k=5&metric=cosine&algo=hnsw` |
| GET | `/benchmark` | `v=...&k=5&metric=cosine` |
| GET | `/hnsw-info` | Optional `metric=cosine` |
| GET | `/stats` | Demo counts and supported algorithms/metrics |
| GET | `/status` | Ollama/model availability and collection counts |
| POST | `/doc/insert` | `{title, text}` |
| GET | `/doc/list` | Chunk titles, previews, word counts and document IDs |
| DELETE | `/doc/delete/:id` | Delete one chunk; clean up its marker on the last chunk |
| POST | `/doc/search` | `{question, k: 3}` |
| POST | `/doc/ask` | `{question, k: 3}` |

Supported algorithms: `bruteforce`, `kdtree`, `hnsw`. Metrics: `cosine`, `euclidean`, `manhattan`. K must be an integer from 1–100 (the demo slider uses 1–10).

Input limits: 1 MB JSON body, 200,000 text characters, at most 100 chunks per insertion, 500-character document title, 1,000-character vector description, 10,000-character question. Demo vectors must contain exactly 16 finite values with magnitude at most 1,000,000.

## What changed from the C++ project

| Original behavior / issue | TypeScript implementation |
| --- | --- |
| Two identical supplied C++ files | One modular TypeScript implementation |
| Handmade JSON parsing | Express JSON parsing and Zod schemas |
| KD-Tree axis pruning also applied to cosine | Cosine traversal visits both branches for correctness; Euclidean/Manhattan retain pruning |
| HNSW graph built with cosine, queried with any metric | Dedicated HNSW graph for each selected demo metric |
| Deletion could leave an unsuitable HNSW entry point | Rebuild on deletion to retain valid layers and connectivity |
| Partial chunks remained after an embedding failed | All model calls and dimensions validated before committing a batch |
| Titles matched by prefix to identify map markers | Explicit `documentId` relationships |
| Deleted chunks left orphan visualization markers | Last-chunk deletion removes the linked marker |
| Inconsistent HTML escaping | React renders user and model strings as text |
| Random query jitter and PCA initialization | Repeatable text-seeded jitter and deterministic PCA |
| One-shot microsecond benchmark | Median of 21 timed searches after 5 warm-up runs; UI labels the method |
| Ollama availability only checked service health | Status checks required model names too |
| Legacy `/api/embeddings` request | Current `/api/embed` payload, automatic response dimension detection |
| Fixed desktop layout | Original desktop composition plus tablet/mobile layouts |

HNSW remains approximate. The port uses the same style of nearest-M neighbor selection, but a seeded JavaScript generator instead of C++ `mt19937`. Graph shape, timings and floating-point results are not bit-for-bit identical. KD-Tree cosine search sacrifices pruning to give correct results. TypeScript is not expected to match native C++ throughput.

## Preserved limitations and semantics

- **In-memory storage:** restarting the API resets the original 20 demo vectors and removes inserted vectors/documents. The source is durable; runtime data is intentionally session-only.
- **Single API process:** the indexes belong to that process. Running multiple independent API instances would create independent data stores.
- **Text paste only:** no PDF parsing, user accounts, durable database or multi-user isolation is added.
- **Single-turn AI:** the UI shows the latest exchange. Earlier questions are not included in the prompt.
- **Original answer policy:** if document context is insufficient, the generation prompt allows general knowledge. The UI explains this and shows the retrieved chunks; it does not claim every answer is document-grounded.
- **Animation, not streaming:** the server returns the complete answer, then the UI reveals it with a typewriter effect.
- **Visualization is representative:** documents are represented by synthetic demo vectors, not by a 2D projection of their real model embeddings. The query star is the weighted neighborhood of the first matches, not a projected query vector.
- **Local-first hosting:** a remotely hosted backend must reach its own Ollama service. Its `localhost` is not your laptop.
- **Long ingestion:** the frontend proxy allows up to four minutes per request; unusually slow model runs or very long documents should be split into smaller submissions.

## Verification

See `VERIFICATION.md` for the checks completed on this deliverable and the boundary between test-fixture coverage and real-model testing.

## Optional container

```bash
docker build -t vectordb-ts .
docker run --rm -p 3000:3000 -e OLLAMA_BASE_URL=http://host.docker.internal:11434 vectordb-ts
```

On Linux, add `--add-host=host.docker.internal:host-gateway` if needed. Ollama must listen on an interface reachable from the container. The API stays internal to the container; the Next.js proxy forwards requests to it. This container recipe is provided for convenience; the delivered checks run directly under Node.js, not Docker.
