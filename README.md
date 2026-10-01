# Vector Database & Local RAG System (TypeScript)

> **📺 Watch Live Demo:** [Insert your YouTube/Loom video link here]
> 
> *Alternatively, drag and drop your `2026-10-01 23-29-08.mp4` file right here in the GitHub editor to embed it automatically!*

A full-stack, from-scratch implementation of a **Vector Database** and **Retrieval-Augmented Generation (RAG)** system built entirely on a modern Node.js/TypeScript stack. 

This project goes beyond using "black-box" APIs by implementing core algorithms like **HNSW, KD-Tree, and distance metrics** from scratch, while integrating a 100% local, privacy-first AI engine using Ollama.

## Key Features
- 🧠 **Custom Vector Engine:** Implements HNSW, KD-Tree, and Brute-force search in raw TypeScript.
- 📐 **Semantic Metrics:** Calculates Cosine Similarity, Euclidean, and Manhattan distances manually.
- 🔒 **100% Local RAG Pipeline:** Uses Ollama (`nomic-embed-text` and `llama3.2`) for embeddings and answer generation. No data leaves the local machine, preventing privacy leaks.
- 👁️ **Visual Vector Space:** Uses PCA (Principal Component Analysis) to project high-dimensional embeddings down to an interactive 2D dashboard for visual understanding.

## Quick start

Requirements: **Node.js 22.14+**, npm, PostgreSQL with pgvector, and Ollama for document/AI features.

From the extracted `vectordb-ts` folder:

```bash
npm ci
docker compose -f compose.database.yml up -d
# Copy apps/api/.env.example to apps/api/.env and set DATABASE_URL.
npm run db:migrate -w @vectordb/api
npm run dev
```

Open **http://localhost:3000**. The API runs at **http://127.0.0.1:8080**.

Register at `/register`, then sign in. Each account gets its own persistent 20-vector playground, even without Ollama. Search for `binary tree`, `calculus`, `sushi`, or `basketball`, switch algorithms/metrics, insert/delete vectors, and compare timings.

### Enable document search and Ask AI

Install [Ollama](https://ollama.com/download), start its desktop application or run `ollama serve`, and download the original models:

```bash
ollama pull nomic-embed-text
ollama pull llama3.2
```

Use **Documents → Refresh** to check availability. Enter a title and paste text, then choose **Embed notes**. In **Ask AI**, enter a question. Click numbered citations to inspect saved source text and PDF page ranges.

The models run on the machine hosting Ollama. Model downloads and first inference can take time. No paid API key is required for this local-model configuration.

### Optional configuration

Configure the database before starting. Copy:

- `apps/api/.env.example` → `apps/api/.env`
- `apps/web/.env.example` → `apps/web/.env.local`

API variables:

| Variable             | Default                  | Purpose                                                  |
| -------------------- | ------------------------ | -------------------------------------------------------- |
| `DATABASE_URL`       | required                 | PostgreSQL connection string with pgvector               |
| `NODE_ENV`           | development              | Set `production` behind HTTPS for Secure session cookies |
| `PORT`               | `8080`                   | API listener port                                        |
| `HOST`               | `127.0.0.1`              | API listener host                                        |
| `OLLAMA_BASE_URL`    | `http://127.0.0.1:11434` | Ollama address reachable by the API                      |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text`       | Embedding model                                          |
| `OLLAMA_GEN_MODEL`   | `llama3.2`               | Generation model                                         |
| `WEB_ORIGIN`         | `http://localhost:3000`  | Exact frontend origin for CORS and CSRF validation       |

The frontend's server-side `API_ORIGIN` defaults to `http://127.0.0.1:8080`. Browser requests go to the same-origin `/api/*` proxy. Rebuild the frontend after changing `API_ORIGIN` for production.

Do not mix embeddings from different models in a running document collection, even if dimensions match. Delete/reinsert documents after changing models.

## Scripts

| Command                | Action                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`          | Start both apps with reload                                                                     |
| `npm run typecheck`    | Check backend, core, tests and frontend TypeScript                                              |
| `npm test`             | Run engine, API and Ollama adapter tests                                                        |
| `npm run build`        | Typecheck and create the production Next.js build                                               |
| `npm start`            | Start the API and production frontend after building                                            |
| `npm run test:http`    | Verify cookie auth, Next.js proxy and durable chat/document workflow in an isolated test schema |
| `npm run test:browser` | Run browser tests against a clearly marked test-only Ollama fixture                             |

To run browser checks:

```bash
npx playwright install chromium
docker compose -f compose.test.yml up -d --wait
# PowerShell:
$env:TEST_DATABASE_URL="postgresql://vectordb:vectordb_test_only@127.0.0.1:5434/vectordb_test"
npm run test:browser
```

On Linux, use `export TEST_DATABASE_URL=...` and install Chromium dependencies if needed. Browser/HTTP tests use ports 13000, 18080 and 11435, a separate Next.js output directory and disposable database schemas. Set TEST_DATABASE_URL before either command. Test responses are explicitly labeled; normal startup never starts the fixture.

## Architecture

| Directory                             | Responsibility                                              |
| ------------------------------------- | ----------------------------------------------------------- |
| `apps/web/app`                        | Next.js entry points, original-theme CSS, responsive layout |
| `apps/web/components/Dashboard.tsx`   | Search, documents, Ask AI and UI state                      |
| `apps/web/components/ScatterPlot.tsx` | Animated PCA canvas, tooltips, embedding bars               |
| `apps/web/components/api.ts`          | Same-origin API requests and error messages                 |
| `apps/api/src/app.ts`                 | Express routes, request validation and RAG orchestration    |
| `apps/api/src/ollama.ts`              | Typed Ollama adapter, timeouts and model availability       |
| `apps/api/src/server.ts`              | API startup and graceful shutdown                           |
| `packages/core/src`                   | Framework-independent vector engine and shared types        |
| `tests`                               | Algorithm, API, adapter and browser verification            |

PostgreSQL owns persistent documents, vectors, accounts, sessions and chats. Each authenticated request builds an isolated demo index from its user's rows, keeping private vectors separate and reflecting other workers' changes. For document ingestion, all embeddings are collected and validated before the atomic database transaction; no chunks become visible if a model request fails.

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

| Method | Route             | Request                                                 |
| ------ | ----------------- | ------------------------------------------------------- |
| GET    | `/items`          | List demo vectors                                       |
| POST   | `/insert`         | `{metadata, category, embedding: number[16]}`           |
| DELETE | `/delete/:id`     | Remove demo vector or map marker                        |
| GET    | `/search`         | `v=comma,separated,vector&k=5&metric=cosine&algo=hnsw`  |
| GET    | `/benchmark`      | `v=...&k=5&metric=cosine`                               |
| GET    | `/hnsw-info`      | Optional `metric=cosine`                                |
| GET    | `/stats`          | Demo counts and supported algorithms/metrics            |
| GET    | `/status`         | Ollama/model availability and collection counts         |
| POST   | `/doc/insert`     | `{title, text}`                                         |
| GET    | `/doc/list`       | Chunk titles, previews, word counts and document IDs    |
| DELETE | `/doc/delete/:id` | Delete one chunk; clean up its marker on the last chunk |
| POST   | `/doc/search`     | `{question, k: 3}`                                      |
| POST   | `/doc/ask`        | `{question, k: 3}`                                      |

Supported algorithms: `bruteforce`, `kdtree`, `hnsw`. Metrics: `cosine`, `euclidean`, `manhattan`. K must be an integer from 1–100 (the demo slider uses 1–10).

Input limits: 1 MB JSON body, 200,000 text characters, at most 100 chunks per insertion, 500-character document title, 1,000-character vector description, 10,000-character question. Demo vectors must contain exactly 16 finite values with magnitude at most 1,000,000.


## Preserved limitations and semantics

- **Private persistent storage:** ownership comes from verified sessions. Per-request demo index rebuilding favors isolation and freshness over large-dataset throughput.
- **PDF support:** selectable text and page references, maximum 10 MB/100 pages. Scanned PDFs need OCR. Original PDF binaries are not retained; citations open saved extracted text and page ranges.
- **Chat context:** up to eight recent completed messages and 16,000 characters help resolve follow-ups. Failed messages retain their settings and can be retried without duplicate submissions.
- **Answer policy:** document-only mode skips answer generation without relevant context; disabling it allows general knowledge. Conversation history is context, not document evidence.
- **Complete responses:** answers arrive after generation; token streaming is not implemented.
- **Visualization is representative:** documents are represented by synthetic demo vectors, not by a 2D projection of their real model embeddings. The query star is the weighted neighborhood of the first matches, not a projected query vector.
- **Local-first hosting:** a remotely hosted backend must reach its own Ollama service. Its `localhost` is not your laptop.
- **Long ingestion:** the frontend proxy allows up to four minutes per request; unusually slow model runs or very long documents should be split into smaller submissions.

## Verification

See `VERIFICATION.md` for the checks completed on this deliverable and the boundary between test-fixture coverage and real-model testing.

## Optional container

```bash
docker build -t vectordb-ts .
docker run --rm -p 3000:3000 -e DATABASE_URL=your-postgres-connection-string -e OLLAMA_BASE_URL=http://host.docker.internal:11434 vectordb-ts
```

On Linux, add `--add-host=host.docker.internal:host-gateway` if needed. Ollama must listen on an interface reachable from the container. The API stays internal to the container; the Next.js proxy forwards requests to it. This container recipe is provided for convenience; the delivered checks run directly under Node.js, not Docker.

## Accounts and existing data

Migration `003_private_accounts_chats.sql` backfills existing documents and vectors to a locked legacy owner, preserving IDs, and enforces NOT NULL ownership. No public signup can claim those rows. Register your initial account, then explicitly transfer legacy data from the trusted local CLI:

```bash
npm run db:claim-legacy -w @vectordb/api -- your-registered-email@example.com
```

The transfer is atomic and idempotent. The legacy account has no password and cannot log in. Register/login use salted scrypt password hashes. Random session tokens are stored only as SHA-256 hashes, expire after seven days and are revoked on logout. Cookies are HTTP-only, SameSite=Lax, and Secure in production. Mutations require `X-Requested-With: VectorDB` and reject nonmatching browser origins. Set WEB_ORIGIN to the exact frontend origin including port; production requires HTTPS. Authentication attempts are limited by IP in PostgreSQL (20 per 15 minutes).

Chat APIs: `POST/GET /conversations`, `GET/POST /conversations/:id/messages`, `PATCH/DELETE /conversations/:id`. Message POST accepts `question`, UUID `requestId`, optional `documentIds`, `documentsOnly`, `k` and explicit `retry`. Each assistant response stores independent source snapshots, so deleting a PDF keeps old citations inspectable with a deleted-source label. Failed/pending messages can be retried with the same ID and settings. Conversation locks serialize generation across API workers; a separate four-connection pool keeps long generations from exhausting normal retrieval connections.

Security references: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Code formatting

Run `npm run format` to format the project, or `npm run format:check` to check formatting without changing files. Prettier uses two-space indentation, single quotes and a 100-character target line width. EditorConfig keeps editor whitespace consistent. Generated files and applied SQL migrations are excluded; migration checksums must remain unchanged.

## Frontend styling

The entire UI uses Tailwind CSS v4 through `@tailwindcss/postcss`. `apps/web/app/globals.css` contains shared light/dark tokens (`@theme inline`), base utilities and reusable component recipes built with `@apply`. JSX utilities handle individual overrides, including the red logout button. Keep reusable styles in the component layer so utility classes can override them predictably. Inline styles are reserved for runtime data such as PCA tooltip coordinates, category colors and benchmark bar widths; canvas drawing stays in JavaScript.

Reference: [Tailwind functions and directives](https://tailwindcss.com/docs/functions-and-directives).
