'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  Algorithm,
  Benchmark,
  Category,
  DocSummary,
  GraphInfo,
  Metric,
  SearchResult,
  Status,
  VectorItem,
} from '@vectordb/core/types';
import { textToEmbedding } from '@vectordb/core/demo';
import ScatterPlot, { COLORS, EmbeddingChart } from './ScatterPlot';
import { api, errorMessage } from './api';
import { ThemeToggle } from './ThemeProvider';
import ChatPanel, { type SourceProjection } from './ChatPanel';

const ALGORITHMS: {
  id: Algorithm;
  label: string;
}[] = [
  {
    id: 'hnsw',
    label: 'HNSW',
  },
  {
    id: 'kdtree',
    label: 'KD-TREE',
  },
  {
    id: 'bruteforce',
    label: 'BRUTE',
  },
];

const CATEGORIES: {
  id: Category;
  label: string;
}[] = [
  { id: 'cs', label: 'CS / Algorithms' },
  { id: 'math', label: 'Mathematics' },
  { id: 'food', label: 'Food & Cooking' },
  { id: 'sports', label: 'Sports & Games' },
  { id: 'doc', label: 'Documents (RAG)' },
];
const latency = (us: number) =>
  us < 1000 ? `${us.toFixed(1)} μs` : `${(us / 1000).toFixed(2)} ms`;
function sourcePageLabel(source: { pageStart?: number | null; pageEnd?: number | null }) {
  const start = source.pageStart;
  const end = source.pageEnd;

  if (start == null || end == null) {
    return 'Page reference unavailable';
  }

  return start === end ? `PDF page ${start}` : `PDF pages ${start}–${end}`;
}
function Section({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="sec">{title}</h2>
      {children}
    </section>
  );
}
export default function Dashboard({ accountControls }: { accountControls: React.ReactNode }) {
  const [items, setItems] = useState<VectorItem[]>([]),
    [loaded, setLoaded] = useState(false);
  const [graph, setGraph] = useState<GraphInfo | null>(null),
    [status, setStatus] = useState<Status | null>(null),
    [documents, setDocuments] = useState<DocSummary[]>([]);
  const [tab, setTab] = useState<'search' | 'docs' | 'rag'>('search');
  const [query, setQuery] = useState(''),
    [algo, setAlgo] = useState<Algorithm>('hnsw'),
    [metric, setMetric] = useState<Metric>('cosine'),
    [k, setK] = useState(5);
  const [result, setResult] = useState<SearchResult | null>(null),
    [embedding, setEmbedding] = useState<number[] | null>(null),
    [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [hitIds, setHitIds] = useState<number[]>([]),
    [hoverId, setHoverId] = useState<number | null>(null),
    [queryLabel, setQueryLabel] = useState('');
  const [sourceProjection, setSourceProjection] = useState<SourceProjection | null>(null);
  const projectionSources = sourceProjection?.contexts ?? [];
  const sourceMarkerIds = [
    ...new Set(
      projectionSources.flatMap((source) => {
        if (!documents.some((chunk) => chunk.id === source.id)) return [];
        const marker = items.find((item) => item.documentId === source.documentId);
        return marker ? [marker.id] : [];
      }),
    ),
  ];
  const [metadata, setMetadata] = useState(''),
    [category, setCategory] = useState<Category>('cs');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([]);
  const [title, setTitle] = useState(''),
    [docText, setDocText] = useState(''),
    [insertStatus, setInsertStatus] = useState('');
  const [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const busyRef = useRef(false),
    metricRef = useRef(metric);
  metricRef.current = metric;
  const refreshStatus = useCallback(async () => {
    setStatus(await api<Status>('/status'));
  }, []);
  const refreshData = useCallback(async () => {
    const [all, info, docs] = await Promise.all([
      api<VectorItem[]>('/items'),
      api<GraphInfo>(`/hnsw-info?metric=${metricRef.current}`),
      api<DocSummary[]>('/doc/list'),
    ]);
    setItems(all);
    setGraph(info);
    setDocuments(docs);
    setLoaded(true);
    const ids = new Set(all.map((v) => v.id));
    setHitIds((old) => old.filter((id) => ids.has(id)));
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<VectorItem[]>('/items'),
      api<GraphInfo>('/hnsw-info'),
      api<DocSummary[]>('/doc/list'),
      api<Status>('/status'),
    ])
      .then(([all, info, docs, state]) => {
        if (active) {
          setItems(all);
          setGraph(info);
          setDocuments(docs);
          setStatus(state);
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    api<GraphInfo>(`/hnsw-info?metric=${metric}`)
      .then((info) => {
        if (active) setGraph(info);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [metric]);

  // Existing documents array contains chunks.
  // Collapse them into one entry per document.
  const availableDocuments = Array.from(
    new Map(
      documents.map((chunk) => [
        chunk.documentId,
        {
          id: chunk.documentId,
          title: chunk.title,
        },
      ]),
    ).values(),
  );

  const toggleDocument = (id: number) => {
    setSelectedDocumentIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

    setHitIds([]);
    setQueryLabel('');
  };

  const perform = async (name: string, fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(name);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };
  const clearSearch = () => {
    setResult(null);
    setBenchmark(null);
    setHitIds([]);
    setQueryLabel('');
  };

  const runSearch = () =>
    perform('search', async () => {
      if (!query.trim()) throw new Error('Enter a query to search.');

      const vector = textToEmbedding(query),
        params = new URLSearchParams({ v: vector.join(','), k: String(k), metric, algo });

      const data = await api<SearchResult>(`/search?${params}`);
      setResult(data);
      setEmbedding(vector);
      setHitIds(data.results.map((v) => v.id));
      setQueryLabel(query);
      setTab('search');
    });

  const runBenchmark = () =>
    perform('benchmark', async () => {
      const vector = textToEmbedding(query.trim() || 'binary tree algorithm');
      setBenchmark(
        await api<Benchmark>(
          `/benchmark?${new URLSearchParams({ v: vector.join(','), k: String(k), metric })}`,
        ),
      );
      setTab('search');
    });
  const insertVector = () =>
    perform('insert', async () => {
      if (!metadata.trim()) throw new Error('Enter a description for the vector.');
      await api('/insert', {
        metadata: metadata.trim(),
        category,
        embedding: textToEmbedding(metadata + ' ' + category),
      });
      setMetadata('');
      clearSearch();
      await refreshData();
    });
  const deleteVector = (id: number) =>
    perform('delete', async () => {
      await api(`/delete/${id}`, undefined, 'DELETE');
      clearSearch();
      await refreshData();
    });
  const insertDocument = () =>
    perform('document', async () => {
      setInsertStatus('');

      if (!pdfFile && (!title.trim() || !docText.trim())) {
        throw new Error('Enter a title and text, or choose a PDF.');
      }

      if (pdfFile) {
        if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
          throw new Error('Please select a PDF file.');
        }

        if (pdfFile.size > 10 * 1024 * 1024) {
          throw new Error('PDF must be smaller than 10 MB.');
        }
      }

      const documentTitle = title.trim() || pdfFile!.name.replace(/\.pdf$/i, '');

      type InsertResult = {
        chunks: number;
        dims: number;
        pages?: number;
      };

      const data = pdfFile
        ? await api<InsertResult>(
            `/doc/upload?${new URLSearchParams({
              title: documentTitle,
              filename: pdfFile.name,
            })}`,
            pdfFile,
          )
        : await api<InsertResult>('/doc/insert', {
            title: documentTitle,
            text: docText.trim(),
          });

      setInsertStatus(`${documentTitle} · ${data.chunks} chunks · ${data.dims}D embeddings`);

      setTitle('');
      setDocText('');
      setPdfFile(null);

      if (pdfInput.current) {
        pdfInput.current.value = '';
      }

      clearSearch();

      await Promise.all([refreshData(), refreshStatus()]);
    });
  const deleteDocument = (id: number) =>
    perform('delete', async () => {
      await api(`/doc/delete/${id}`, undefined, 'DELETE');
      clearSearch();
      await Promise.all([refreshData(), refreshStatus()]);
    });
  return (
    <div className={`app-shell ${tab === 'rag' ? 'chat-mode' : ''}`}>
      <header className="app-navbar">
        <nav className="navbar-inner" aria-label="Main navigation">
          <div className="navbar-brand">
            <h1>VectorLens</h1>
            <div className="navbar-algorithms">
              <span className="badge hl">HNSW</span>
              <span className="badge">KD-TREE</span>
              <span className="badge">BRUTE FORCE</span>
            </div>
            <span
              className={`badge ${status?.modelsReady ? 'ok' : status ? 'err' : ''}`}
              title={status?.missingModels.join(', ')}
            >
              {status
                ? status.modelsReady
                  ? 'OLLAMA ✓'
                  : status.ollamaAvailable
                    ? 'MODELS MISSING'
                    : 'OLLAMA ✗'
                : 'OLLAMA…'}
            </span>
          </div>
          <div className="navbar-actions">
            <span id="statsLabel">
              {loaded ? `${items.length} vectors · 16 dims` : 'Connecting…'}
            </span>
            <ThemeToggle />
            {accountControls}
          </div>
        </nav>
      </header>
      {error && (
        <div className="notice" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      <main className="layout">
        <aside className="left-panel" aria-label="Vector search controls">
          <Section title="Query (Demo Vectors)" className="query-section">
            <form
              className="panel-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch();
              }}
            >
              <input
                aria-label="Search query"
                type="text"
                placeholder="binary tree, sushi, basketball…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={10000}
              />
              <button className="btn-p" disabled={!!busy}>
                {busy === 'search' ? 'SEARCHING…' : '⚡ SEARCH'}
              </button>
            </form>
          </Section>
          <Section title="Algorithm">
            <div className="algo-row">
              {ALGORITHMS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={!!busy}
                  aria-pressed={algo === a.id}
                  className={`algo-btn ${algo === a.id ? 'on' : ''}`}
                  onClick={() => {
                    setAlgo(a.id);
                    clearSearch();
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Distance Metric">
            <select
              aria-label="Distance metric"
              disabled={!!busy}
              value={metric}
              onChange={(e) => {
                setMetric(e.target.value as Metric);
                clearSearch();
              }}
            >
              <option value="cosine">Cosine Distance</option>
              <option value="euclidean">Euclidean Distance</option>
              <option value="manhattan">Manhattan Distance</option>
            </select>
          </Section>
          <Section title={`Top-K: ${k}`}>
            <input
              type="range"
              aria-label="Top K"
              min={1}
              max={10}
              value={k}
              disabled={!!busy}
              onChange={(e) => {
                setK(Number(e.target.value));
                clearSearch();
              }}
            />
          </Section>
          <Section title="Category Legend">
            <div className="legend">
              {CATEGORIES.map((c) => (
                <div key={c.id} className="leg-row">
                  <span
                    className="dot"
                    style={{ background: COLORS[c.id], boxShadow: `0 0 5px ${COLORS[c.id]}` }}
                  />
                  {c.label}
                </div>
              ))}
            </div>
          </Section>
          <Section title="Insert Demo Vector" className="insert-section">
            <form
              className="panel-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void insertVector();
              }}
            >
              <input
                type="text"
                aria-label="Vector description"
                placeholder="Description…"
                value={metadata}
                maxLength={1000}
                onChange={(e) => setMetadata(e.target.value)}
              />
              <select
                aria-label="Vector category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {CATEGORIES.filter((c) => c.id !== 'doc').map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button className="btn-s" disabled={!!busy}>
                {busy === 'insert' ? 'INSERTING…' : '+ INSERT'}
              </button>
            </form>
          </Section>
          <Section title="Benchmark">
            <button className="btn-s" onClick={() => void runBenchmark()} disabled={!!busy}>
              {busy === 'benchmark' ? 'COMPARING…' : '▶ COMPARE ALL ALGOS'}
            </button>
          </Section>
          <p className="muted">
            Private storage · documents, vectors and chats persist across restarts.
          </p>
        </aside>
        {tab !== 'rag' && (
          <ScatterPlot
            items={items}
            hitIds={hitIds}
            hoverId={hoverId}
            queryLabel={queryLabel}
            loaded={loaded}
          />
        )}
        {tab === 'rag' && (
          <Section title="Query source projection" className="rag-projection">
            <ScatterPlot
              items={items}
              hitIds={sourceMarkerIds}
              hoverId={null}
              queryLabel={sourceProjection?.question ?? ''}
              loaded={loaded}
            />
            <div className="projection-summary" role="status">
              {sourceProjection ? (
                <>
                  <strong>Query: {sourceProjection.question}</strong>
                  <p>
                    {sourceProjection.state === 'loading'
                      ? 'Retrieving sources and generating the answer...'
                      : sourceProjection.state === 'failed'
                        ? 'Query failed or was interrupted. Retry to retrieve its sources.'
                        : sourceMarkerIds.length
                          ? `${sourceMarkerIds.length} source document(s) highlighted. Lines connect the query to retrieved documents.`
                          : projectionSources.length
                            ? 'Saved sources are no longer on the current map. Their citation snapshots remain available.'
                            : 'No document sources matched this answer.'}
                  </p>
                  {projectionSources.length > 0 && (
                    <ul>
                      {projectionSources.map((source) => (
                        <li key={source.id}>
                          {source.title} · chunk {source.id} · {sourcePageLabel(source)}
                          {documents.some((chunk) => chunk.id === source.id)
                            ? ''
                            : ' · Saved source (deleted)'}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p>
                  Ask a question to highlight its retrieved documents here. Select an answer or
                  citation to inspect earlier sources.
                </p>
              )}
            </div>
          </Section>
        )}

        <aside className="right-panel" aria-label="Results and documents">
          <div className="tabs" role="tablist" aria-label="Workspace tabs">
            {(['search', 'docs', 'rag'] as const).map((value, i) => (
              <button
                key={value}
                role="tab"
                id={`tab-button-${value}`}
                aria-selected={tab === value}
                aria-controls={`panel-${value}`}
                tabIndex={tab === value ? 0 : -1}
                className={`tab ${tab === value ? 'on' : ''}`}
                onClick={() => setTab(value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                    event.preventDefault();
                    const values = ['search', 'docs', 'rag'] as const;
                    const next = values[(i + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
                    setTab(next);
                    document.getElementById(`tab-button-${next}`)?.focus();
                  }
                }}
              >
                {['SEARCH', 'DOCUMENTS', 'ASK AI'][i]}
              </button>
            ))}
          </div>
          <div
            id="panel-search"
            role="tabpanel"
            aria-labelledby="tab-button-search"
            className={`tab-content ${tab === 'search' ? 'on' : ''}`}
          >
            <Section title="Search Latency">
              <div className="lat-big">{result ? latency(result.latencyUs) : '—'}</div>
              <div className="lat-sub">
                {result
                  ? `${result.algo.toUpperCase()} · ${result.metric} · k=${k}`
                  : 'No query yet'}
              </div>
            </Section>
            <Section title="Top Matches">
              <div className="results">
                {result ? (
                  result.results.length ? (
                    result.results.map((hit, i) => (
                      <article
                        key={hit.id}
                        className="rcard"
                        onMouseEnter={() => setHoverId(hit.id)}
                        onMouseLeave={() => setHoverId(null)}
                      >
                        <div className="rrank">#{i + 1} NEAREST</div>
                        <p className="rmeta">{hit.metadata}</p>
                        <div className="rfoot">
                          <span
                            className="rcat"
                            style={{
                              background: COLORS[hit.category] + '18',
                              color: COLORS[hit.category],
                              border: `1px solid ${COLORS[hit.category]}44`,
                            }}
                          >
                            {hit.category.toUpperCase()}
                          </span>
                          <span className="rdist">dist: {hit.distance.toFixed(5)}</span>
                          <button
                            className="del"
                            aria-label={`Delete vector ${hit.metadata}`}
                            title={
                              hit.documentId
                                ? 'Remove map marker only; delete chunks in Documents'
                                : 'Delete vector'
                            }
                            disabled={!!busy}
                            onClick={() => void deleteVector(hit.id)}
                          >
                            ×
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="muted">No results. Insert a vector to get started.</p>
                  )
                ) : (
                  <p className="muted">Run a search to see results…</p>
                )}
              </div>
            </Section>
            <Section title="Query Embedding (16D)">
              <EmbeddingChart embedding={embedding} />
            </Section>
            {benchmark && (
              <Section title="Algorithm Comparison">
                <div className="bench">
                  {[
                    { label: 'Brute Force', value: benchmark.bruteforceUs, color: '#f38ba8' },
                    { label: 'KD-Tree', value: benchmark.kdtreeUs, color: '#89dceb' },
                    { label: 'HNSW', value: benchmark.hnswUs, color: '#b388ff' },
                  ].map((row) => (
                    <div className="brow" key={row.label}>
                      <div className="blabel">
                        <span style={{ color: row.color }}>{row.label}</span>
                        <span>{latency(row.value)}</span>
                      </div>
                      <div className="btrack">
                        <div
                          className="bfill"
                          style={{
                            width: `${Math.max(2, (row.value / Math.max(benchmark.bruteforceUs, benchmark.kdtreeUs, benchmark.hnswUs, 0.001)) * 100)}%`,
                            background: row.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="muted mt-2">
                  Median of 21 runs after warm-up · {benchmark.itemCount} vectors · search time only
                </p>
              </Section>
            )}
            <Section title="HNSW Graph Layers">
              <div className="layers">
                {graph ? (
                  graph.nodeCount ? (
                    graph.nodesPerLayer.map((count, i) => (
                      <div key={i} className="lrow">
                        <span className="lnum">L{i}</span>
                        <div className="ltrack">
                          <div
                            className="lfill"
                            style={{
                              width: `${Math.max(2, (count / Math.max(1, graph.nodesPerLayer[0])) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="lcount">
                          {count}n · {graph.edgesPerLayer[i]}e
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Empty index</p>
                  )
                ) : (
                  <p className="muted">Loading…</p>
                )}
              </div>
            </Section>
          </div>
          <div
            id="panel-docs"
            role="tabpanel"
            aria-labelledby="tab-button-docs"
            className={`tab-content ${tab === 'docs' ? 'on' : ''}`}
          >
            <Section title="Ollama Status">
              <div className={`ollama-status ${status?.modelsReady ? 'ok' : 'err'}`}>
                <div className="status-head">
                  <span className={status?.modelsReady ? 'text-success' : 'text-danger'}>
                    ●{' '}
                    {status
                      ? status.modelsReady
                        ? 'Ready'
                        : status.ollamaAvailable
                          ? 'Models missing'
                          : 'Offline'
                      : 'Checking…'}
                  </span>
                  <button
                    className="status-refresh"
                    disabled={!!busy}
                    onClick={() =>
                      void perform('status', async () => {
                        await Promise.all([refreshStatus(), refreshData()]);
                      })
                    }
                  >
                    Refresh
                  </button>
                </div>
                <dl className="status-grid">
                  <dt>Embed</dt>
                  <dd>{status?.embedModel || 'nomic-embed-text'}</dd>
                  <dt>Generate</dt>
                  <dd>{status?.genModel || 'llama3.2'}</dd>
                  <dt>Dimensions</dt>
                  <dd>{status?.docDims || 'Set on first insert'}</dd>
                  <dt>Chunks</dt>
                  <dd>{documents.length}</dd>
                </dl>
                {status && !status.modelsReady && (
                  <p className="muted mt-2">
                    Start Ollama and install the models:
                    <br />
                    <code>ollama pull {status.embedModel}</code>
                    <br />
                    <code>ollama pull {status.genModel}</code>
                  </p>
                )}
              </div>
            </Section>
            <Section title="Add a document">
              <form
                className="panel-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void insertDocument();
                }}
              >
                <label className="pdf-upload">
                  <span className="pdf-upload-icon" aria-hidden="true">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 16V4m-4 4 4-4 4 4" />
                      <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                    </svg>
                  </span>

                  <strong>{pdfFile ? pdfFile.name : 'Bring your documents to life'}</strong>

                  <span className="pdf-upload-description">
                    {pdfFile
                      ? `${(pdfFile.size / 1024 / 1024).toFixed(2)} MB · Ready to upload`
                      : 'Choose a PDF and ask questions about its content.'}
                  </span>

                  <span className="pdf-upload-action">{pdfFile ? 'Change PDF' : 'Choose PDF'}</span>

                  <input
                    ref={pdfInput}
                    className="sr-only"
                    type="file"
                    accept=".pdf,application/pdf"
                    aria-label="Upload PDF"
                    disabled={!!busy}
                    onChange={(event) => {
                      setPdfFile(event.target.files?.[0] || null);
                      setInsertStatus('');
                    }}
                  />

                  <span className="pdf-upload-limit">Text-based PDF · Up to 10 MB</span>
                </label>

                {pdfFile && (
                  <button
                    type="button"
                    className="btn-s"
                    disabled={!!busy}
                    onClick={() => {
                      setPdfFile(null);

                      if (pdfInput.current) {
                        pdfInput.current.value = '';
                      }
                    }}
                  >
                    Remove selected file
                  </button>
                )}

                <input
                  type="text"
                  aria-label="Document title"
                  placeholder={pdfFile ? 'Title — optional' : 'Give your notes a title'}
                  value={title}
                  maxLength={500}
                  disabled={!!busy}
                  onChange={(event) => setTitle(event.target.value)}
                />

                {!pdfFile && (
                  <>
                    <div className="document-divider">
                      <span>or paste your notes</span>
                    </div>

                    <textarea
                      aria-label="Document text"
                      placeholder="Lecture notes, an article, a textbook excerpt…"
                      value={docText}
                      maxLength={200000}
                      rows={5}
                      disabled={!!busy}
                      onChange={(event) => setDocText(event.target.value)}
                    />
                  </>
                )}

                <button className="btn-p" disabled={!!busy}>
                  {busy === 'document'
                    ? 'Processing document…'
                    : pdfFile
                      ? 'Upload & embed PDF'
                      : 'Embed notes'}
                </button>

                {busy === 'document' && (
                  <p className="thinking" role="status">
                    <span className="spinner" />
                    Creating embeddings. Large documents may take a few minutes.
                  </p>
                )}

                <p className="muted">
                  Scanned PDFs need OCR first. Documents are saved privately and remain available
                  after server restarts.
                </p>

                {insertStatus && (
                  <div className="document-success" role="status">
                    <strong>Your document is ready</strong>
                    <p>{insertStatus}</p>

                    <button type="button" className="btn-g" onClick={() => setTab('rag')}>
                      Ask about this document →
                    </button>
                  </div>
                )}
              </form>
            </Section>
            <Section title={`Stored Chunks (${documents.length})`}>
              <div className="doc-list">
                {documents.length ? (
                  documents.map((doc) => (
                    <article className="dcard" key={doc.id}>
                      <p className="dcard-title">{doc.title}</p>
                      <p className="dcard-preview">{doc.preview}</p>
                      <div className="dcard-foot">
                        <span className="dcard-words">
                          {doc.words} words
                          {doc.pageStart != null && doc.pageEnd != null
                            ? ` · ${sourcePageLabel(doc)}`
                            : ''}
                        </span>
                        <button
                          className="del"
                          disabled={!!busy}
                          aria-label={`Delete chunk ${doc.title}`}
                          onClick={() => void deleteDocument(doc.id)}
                        >
                          ×
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="muted">No documents yet. Insert some above.</p>
                )}
              </div>
            </Section>
          </div>
          <div
            id="panel-rag"
            role="tabpanel"
            aria-labelledby="tab-button-rag"
            className={`tab-content ${tab === 'rag' ? 'on' : ''}`}
          >
            <Section title="Search in documents">
              <div className="document-picker">
                <div className="document-picker-head">
                  <span>
                    {selectedDocumentIds.length
                      ? `${selectedDocumentIds.length} selected`
                      : 'All documents'}
                  </span>

                  {selectedDocumentIds.length > 0 && (
                    <button
                      type="button"
                      className="document-picker-reset"
                      disabled={!!busy}
                      onClick={() => {
                        setSelectedDocumentIds([]);
                        setHitIds([]);
                        setQueryLabel('');
                      }}
                    >
                      Clear selection
                    </button>
                  )}
                </div>

                {availableDocuments.length ? (
                  <div className="document-picker-list">
                    {availableDocuments.map((document) => (
                      <label key={document.id} className="document-picker-item">
                        <input
                          type="checkbox"
                          checked={selectedDocumentIds.includes(document.id)}
                          disabled={
                            !!busy ||
                            (selectedDocumentIds.length >= 100 &&
                              !selectedDocumentIds.includes(document.id))
                          }
                          onChange={() => toggleDocument(document.id)}
                        />

                        <span>{document.title}</span>

                        <small>#{document.id}</small>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Upload a PDF or add notes from the Documents tab.</p>
                )}

                <p className="muted">
                  {selectedDocumentIds.length
                    ? 'Retrieval is limited to your selected documents.'
                    : 'No selection means search across all documents.'}
                </p>
              </div>
            </Section>
            <ChatPanel documentIds={selectedDocumentIds} onProjectionChange={setSourceProjection} />
          </div>
        </aside>
      </main>
    </div>
  );
}
