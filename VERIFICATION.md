# Workflow verification

## Executed results — 30 September 2026

- `npm test` with the dedicated test database and actual container restart: **43 tests passed across 6 files**.
- `npm run test:browser`: **3 end-to-end scenarios passed**. Desktop and 390px mobile screenshots were inspected; citations, login restoration, retry, the unified navbar, persistent light/dark preference and PCA canvas theme colors were exercised.
- `npm run test:http`: passed cookie authentication, Next.js proxy, algorithms, persistent chat, source deletion snapshots and logout.
- `npm run build`: passed backend/frontend TypeScript checks and optimized Next.js build.
- Migration `003_private_accounts_chats.sql` was applied to the configured project database. Legacy ownership transfer was exercised in the test database; assigning real legacy data requires the initial registered account's email.

## Reproduce automated checks

Tests never use the normal application database. PostgreSQL tests require an explicit `TEST_DATABASE_URL` whose database name ends in `_test`; they also reject the configured application database. Every run uses a unique disposable schema. No application tables are truncated.

PowerShell, from the repository root:

```powershell
docker compose -f compose.test.yml up -d --wait
$env:TEST_DATABASE_URL='postgresql://vectordb:vectordb_test_only@127.0.0.1:5434/vectordb_test'
$env:RESTART_TEST_DATABASE='1'
npm test
Remove-Item Env:RESTART_TEST_DATABASE
npm run test:browser
npm run test:http
npm run build
```

`RESTART_TEST_DATABASE=1` restarts only `vectordb-verification-test` on port 5434. The normal database container is never restarted. Run suites sequentially while this flag is enabled. Without TEST_DATABASE_URL, `npm test` runs the memory/unit tests and explicitly skips the PostgreSQL suite. Browser and HTTP tests fail early if the test URL is missing. Install Chromium with `npx playwright install chromium` if needed.

Browser/HTTP tests own ports 13000, 18080 and 11435 and use `.next-test`, avoiding the normal dev-server ports and output directory. Do not run the browser and HTTP suites at the same time. Normal app startup never uses the fixture AI.

## Automated coverage

- Real two-page PDF byte streams for algorithms and cooking: extraction, embedding dimensions, chunk IDs, document markers and page 1-2 references.
- Selected-document filtering for search and Ask AI; unrelated document-only query skips answer generation.
- Invalid PDF and embedding-provider failure leave no partial document.
- Two accounts: unauthorized requests, guessed document/chunk/vector/conversation IDs, private list/search/graph indexes, mutation CSRF checks, salted password hashes, hashed sessions, expiry, logout revocation and persistent login rate limits.
- Chat settings and source snapshots, UUID duplicate rejection/replay, bounded follow-up context, failed generation retention and retry, concurrent requests and recovery of interrupted pending messages.
- API/pool restart and optional actual PostgreSQL restart preserve document/vector IDs, sessions and conversations.
- First/last chunk deletion, parent and marker cleanup, saved citations labeled as deleted sources.
- Existing-data migration quarantines legacy rows; explicit CLI transfer preserves original IDs and enforces ownership.
- Browser interaction: register/login, vector search, PDF upload, per-answer citation click, rename, full threads, logout/login restoration, deleted-source snapshots, failed-message retry, session expiry, and 390px mobile layout.

## Manual acceptance checklist with real Ollama

1. Apply migrations, register account A and optionally claim legacy rows. Register account B in a separate browser profile.
2. Upload two selectable-text PDFs on different topics as A. Record document/chunk/marker IDs. Inspect returned `chunkDetails` or stored-chunk cards; verify page ranges and embedding dimensions in the database.
3. Select only PDF one. Ask a supported question. Each returned source must have that document ID. Use `/doc/search` as well as the chat UI.
4. Enable document-only mode and ask a clearly unrelated question. With no sources above the distance threshold, the answer must report no matching information and `generated:false`. Follow-up rewriting can still call the model to resolve the query; answer generation is skipped.
5. Click each numbered citation on two different answers. It must expand that answer's own saved chunk and PDF page range. Original binary PDFs are not stored; the viewer shows extracted source text.
6. Log out/in, restart the API, then restart the isolated verification database. Confirm the recorded IDs and conversations persist. Never restart a shared production database for a test.
7. Delete one chunk of a multi-chunk PDF; its parent/marker must remain. Delete its last chunk; both must disappear. Reopen the old conversation: citation text/page ranges remain and show `Deleted source (saved snapshot)`.
8. Upload invalid bytes as a PDF, then stop Ollama and attempt a new upload. Expect a clear error and no partial document. Fail a chat generation: user message stays failed; restart Ollama and retry with the same request ID.
9. As B, try A's IDs in search, ask, deletion and conversation endpoints. Expect 404 or `ok:false`, with no A-owned content. Repeat after both API and database restart.
10. Rename/delete a conversation. A deleted conversation and its messages/snapshots must be gone. Duplicate an identical request ID: at most one user/assistant pair; changing its content/settings must return 409.

## Scope of evidence

Automated inference uses deterministic providers and an explicitly labeled Ollama-compatible HTTP fixture. These tests verify storage, retrieval routing, isolation, prompts, failure handling and UI behavior; they do not establish real-model answer quality. Real Ollama inference remains a separate manual check. The PDF parser is real, and PostgreSQL/pgvector tests use the real database engine.

## Account migration

```powershell
npm run db:migrate -w @vectordb/api
# Register your account in the app, then:
npm run db:claim-legacy -w @vectordb/api -- your-registered-email@example.com
```

Legacy data stays under a locked account until explicit assignment. Never auto-assign it to the first public signup. This migration does not delete or renumber documents, chunks or demo vectors.
