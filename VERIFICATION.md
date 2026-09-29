# Verification report

Checked on 19 September 2026 with Node.js 24.19.0.

## Passed

- `npm run build`: strict TypeScript checks and optimized Next.js production build.
- `npm test`: **26 tests across 3 files**.
- `npm run test:http`: running production Next.js server → same-origin proxy → Express → Ollama-compatible test HTTP service.

Engine tests cover all three distance functions, the original 20-vector seed, repeatable demo embeddings, KD-Tree equivalence to exhaustive search for all three metrics, HNSW self-retrieval and recall, deletion of upper-layer nodes, empty indexes, tied distances, reinsertion, dimensions, overlapping chunk boundaries, atomic document batch validation, relevance thresholds, the 10-chunk retrieval boundary, and degenerate PCA input.

API tests cover route response fields, all three algorithms, benchmarks, invalid vectors/metrics/K/JSON, insertion/deletion, embedding failure partway through a document, duplicate-prefix document titles with explicit ID mapping, linked marker cleanup, RAG prompt construction, general-knowledge fallback, provider failures and changed embedding dimensions.

Ollama adapter tests cover the actual HTTP request shape, model tag normalization, missing models, `/api/embed`, `/api/generate`, invalid embeddings, invalid JSON and model errors.

The production HTTP smoke check verified the rendered HTML contains the original branding and workspace tabs; Next.js proxy routes reach the API; all three algorithms return the expected seed item; validation errors remain HTTP 400; model status works; document insertion creates a marker; RAG returns retrieved context and a fixture answer; and deleting the final chunk removes its marker.

## Not verified here

**Visual/browser interaction checks:** two Playwright scenarios are included, covering search, algorithm/metric changes, insertion/deletion, document ingestion, context expansion, plain-text handling of markup, desktop/mobile layout and offline/error recovery. They could not execute here because Chromium was blocked at startup by the execution environment (`socket() failed: Operation not permitted`). This is a browser startup limitation, not a passing browser test. No screenshots are represented as verified.

Run locally after closing development servers:

```bash
npx playwright install chromium
npm run build
npm run test:browser
```

**Real model inference:** Ollama and its models are not installed in this environment. RAG integration was verified with deterministic providers and an explicitly marked Ollama-compatible HTTP fixture, not with real `nomic-embed-text` or `llama3.2` output. Normal application startup always uses the real Ollama adapter and does not start the fixture.

**Container deployment:** the Dockerfile is supplied but was not built or deployed here.

**C++ executable comparison:** the source was inspected and its seed vectors and intended behaviors were ported. The supplied files do not include `httplib.h`; the original executable was not built. Exact results are checked against mathematical references, and HNSW is assessed as approximate search. Native C++ timing or bit-for-bit graph parity is not claimed.
