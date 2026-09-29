'use client';
import { useCallback, useEffect, useRef, useState } from 'react';


import type {
  Algorithm,
  Answer,
  Benchmark,
  Category,
  Context,
  DocSummary,
  GraphInfo,
  Metric,
  SearchResult,
  Status,
  VectorItem
} from '@vectordb/core/types';
import { textToEmbedding } from '@vectordb/core/demo';
import ScatterPlot, { COLORS, EmbeddingChart } from './ScatterPlot';
import { api, errorMessage } from './api';


const ALGORITHMS: {
  id: Algorithm;
  label: string
}[] = [{
  id: 'hnsw',
  label: 'HNSW'
}, {
  id: 'kdtree',
  label: 'KD-TREE'
}, {
  id: 'bruteforce',
  label: 'BRUTE'
}];


const CATEGORIES: {
  id: Category;
  label: string
}[] = [{ id: 'cs', label: 'CS / Algorithms' }, { id: 'math', label: 'Mathematics' }, { id: 'food', label: 'Food & Cooking' }, { id: 'sports', label: 'Sports & Games' }, { id: 'doc', label: 'Documents (RAG)' }];
const latency = (us: number) => us < 1000 ? `${us.toFixed(1)} μs` : `${(us / 1000).toFixed(2)} ms`;
function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) { return <section className={className}><h2 className="sec">{title}</h2>{children}</section>; }
function TypedAnswer({ text }: { text: string }) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    setLength(0); if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setLength(text.length); return; }
    const start = performance.now(), duration = Math.min(4500, text.length * 6);
    const timer = setInterval(() => { const n = Math.min(text.length, Math.ceil((performance.now() - start) / Math.max(1, duration) * text.length)); setLength(n); if (n === text.length) clearInterval(timer); }, 18);
    return () => clearInterval(timer);
  }, [text]);
  return <><p className={`chat-a-text ${length < text.length ? 'typing' : ''}`} aria-hidden="true">{text.slice(0, length)}</p><p className="sr-only">{text}</p></>;
}
export default function Dashboard() {
  const [items, setItems] = useState<VectorItem[]>([]), [loaded, setLoaded] = useState(false);
  const [graph, setGraph] = useState<GraphInfo | null>(null), [status, setStatus] = useState<Status | null>(null), [documents, setDocuments] = useState<DocSummary[]>([]);
  const [tab, setTab] = useState<'search' | 'docs' | 'rag'>('search');
  const [query, setQuery] = useState(''), [algo, setAlgo] = useState<Algorithm>('hnsw'), [metric, setMetric] = useState<Metric>('cosine'), [k, setK] = useState(5);
  const [result, setResult] = useState<SearchResult | null>(null), [embedding, setEmbedding] = useState<number[] | null>(null), [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [hitIds, setHitIds] = useState<number[]>([]), [hoverId, setHoverId] = useState<number | null>(null), [queryLabel, setQueryLabel] = useState('');
  const [metadata, setMetadata] = useState(''), [category, setCategory] = useState<Category>('cs');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(''), [docText, setDocText] = useState(''), [insertStatus, setInsertStatus] = useState('');
  const [question, setQuestion] = useState(''), [ragK, setRagK] = useState(3), [asked, setAsked] = useState(''), [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const busyRef = useRef(false), metricRef = useRef(metric); metricRef.current = metric;
  const refreshStatus = useCallback(async () => { setStatus(await api<Status>('/status')); }, []);
  const refreshData = useCallback(async () => {
    const [all, info, docs] = await Promise.all([api<VectorItem[]>('/items'), api<GraphInfo>(`/hnsw-info?metric=${metricRef.current}`), api<DocSummary[]>('/doc/list')]);
    setItems(all); setGraph(info); setDocuments(docs); setLoaded(true);
    const ids = new Set(all.map(v => v.id)); setHitIds(old => old.filter(id => ids.has(id)));
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([api<VectorItem[]>('/items'), api<GraphInfo>('/hnsw-info'), api<DocSummary[]>('/doc/list'), api<Status>('/status')]).then(([all, info, docs, state]) => { if (active) { setItems(all); setGraph(info); setDocuments(docs); setStatus(state); setLoaded(true); } }).catch(err => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, []);
  useEffect(() => { let active = true; api<GraphInfo>(`/hnsw-info?metric=${metric}`).then(info => { if (active) setGraph(info); }).catch(err => { if (active) setError(errorMessage(err)); }); return () => { active = false; }; }, [metric]);


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


  const runSearch = () => perform('search', async () => {

    if (!query.trim()) throw new Error('Enter a query to search.');

    const vector = textToEmbedding(query), params = new URLSearchParams({ v: vector.join(','), k: String(k), metric, algo });

    const data = await api<SearchResult>(`/search?${params}`);
    setResult(data);
    setEmbedding(vector);
    setHitIds(data.results.map(v => v.id));
    setQueryLabel(query); setTab('search');

  });


  const runBenchmark = () => perform('benchmark', async () => {
    const vector = textToEmbedding(query.trim() || 'binary tree algorithm');
    setBenchmark(await api<Benchmark>(`/benchmark?${new URLSearchParams({ v: vector.join(','), k: String(k), metric })}`)); setTab('search');
  });
  const insertVector = () => perform('insert', async () => {
    if (!metadata.trim()) throw new Error('Enter a description for the vector.');
    await api('/insert', { metadata: metadata.trim(), category, embedding: textToEmbedding(metadata + ' ' + category) }); setMetadata(''); clearSearch(); await refreshData();
  });
  const deleteVector = (id: number) => perform('delete', async () => { await api(`/delete/${id}`, undefined, 'DELETE'); clearSearch(); await refreshData(); });
  const insertDocument = () => perform('document', async () => {
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

    const documentTitle =
      title.trim() || pdfFile!.name.replace(/\.pdf$/i, '');

    type InsertResult = {
      chunks: number;
      dims: number;
      pages?: number;
    };

    const data = pdfFile
      ? await api<InsertResult>(
        `/doc/upload?${new URLSearchParams({
          title: documentTitle,
        })}`,
        pdfFile
      )
      : await api<InsertResult>('/doc/insert', {
        title: documentTitle,
        text: docText.trim(),
      });

    setInsertStatus(
      `${documentTitle} · ${data.chunks} chunks · ${data.dims}D embeddings`
    );

    setTitle('');
    setDocText('');
    setPdfFile(null);

    if (pdfInput.current) {
      pdfInput.current.value = '';
    }

    setQuestion(`What are the main points in ${documentTitle}?`);
    setAnswer(null);
    setAsked('');
    clearSearch();

    await Promise.all([
      refreshData(),
      refreshStatus(),
    ]);
  });
  const deleteDocument = (id: number) => perform('delete', async () => {
    await api(`/doc/delete/${id}`, undefined, 'DELETE'); clearSearch(); setAnswer(null); setAsked(''); await Promise.all([refreshData(), refreshStatus()]);
  });
  const highlightContexts = (contexts: Context[], label: string) => {
    const mapped = contexts.map(c => items.find(v => v.documentId === c.documentId)?.id).filter((id): id is number => id !== undefined);
    setHitIds([...new Set(mapped)]); setQueryLabel(label);
  };
  const askAI = () => perform('ask', async () => {
    const text = question.trim(); if (!text) throw new Error('Enter a question.'); setAsked(text); setAnswer(null); setHitIds([]); setQueryLabel('');
    // Same retrieval-preview behavior as the original, with IDs instead of title-prefix matching.
    const preview = api<{ contexts: Context[] }>('/doc/search', { question: text, k: ragK }).then(data => highlightContexts(data.contexts, text)).catch(() => { });
    try {
      const data = await api<Answer>('/doc/ask', { question: text, k: ragK }); await preview; setAnswer(data); highlightContexts(data.contexts, text); setQuestion('');
      if (!data.contexts.length) { const vector = textToEmbedding(text); const fallback = await api<SearchResult>(`/search?${new URLSearchParams({ v: vector.join(','), k: '3', metric: 'cosine', algo: 'hnsw' })}`); setHitIds(fallback.results.map(v => v.id)); setQueryLabel(text); }
    } finally { await preview; }
  });
  return <div className="app-shell">
    <header><h1>AI Flow</h1><span className="badge hl">HNSW</span><span className="badge">KD-TREE</span><span className="badge">BRUTE FORCE</span><span className={`badge ${status?.modelsReady ? 'ok' : status ? 'err' : ''}`} title={status?.missingModels.join(', ')}>{status ? status.modelsReady ? 'OLLAMA ✓' : status.ollamaAvailable ? 'MODELS MISSING' : 'OLLAMA ✗' : 'OLLAMA…'}</span><span id="statsLabel">{loaded ? `${items.length} vectors · 16 dims` : 'Connecting…'}</span></header>
    {error && <div className="notice" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
    <main className="layout">
      <aside className="left-panel" aria-label="Vector search controls">
        <Section title="Query (Demo Vectors)" className="query-section"><form className="panel-stack" onSubmit={e => { e.preventDefault(); void runSearch(); }}><input aria-label="Search query" type="text" placeholder="binary tree, sushi, basketball…" value={query} onChange={e => setQuery(e.target.value)} maxLength={10000} /><button className="btn-p" disabled={!!busy}>{busy === 'search' ? 'SEARCHING…' : '⚡ SEARCH'}</button></form></Section>
        <Section title="Algorithm"><div className="algo-row">{ALGORITHMS.map(a => <button key={a.id} type="button" disabled={!!busy} aria-pressed={algo === a.id} className={`algo-btn ${algo === a.id ? 'on' : ''}`} onClick={() => { setAlgo(a.id); clearSearch(); }}>{a.label}</button>)}</div></Section>
        <Section title="Distance Metric"><select aria-label="Distance metric" disabled={!!busy} value={metric} onChange={e => { setMetric(e.target.value as Metric); clearSearch(); }}><option value="cosine">Cosine Distance</option><option value="euclidean">Euclidean Distance</option><option value="manhattan">Manhattan Distance</option></select></Section>
        <Section title={`Top-K: ${k}`}><input type="range" aria-label="Top K" min={1} max={10} value={k} disabled={!!busy} onChange={e => { setK(Number(e.target.value)); clearSearch(); }} /></Section>
        <Section title="Category Legend"><div className="legend">{CATEGORIES.map(c => <div key={c.id} className="leg-row"><span className="dot" style={{ background: COLORS[c.id], boxShadow: `0 0 5px ${COLORS[c.id]}` }} />{c.label}</div>)}</div></Section>
        <Section title="Insert Demo Vector" className="insert-section"><form className="panel-stack" onSubmit={e => { e.preventDefault(); void insertVector(); }}><input type="text" aria-label="Vector description" placeholder="Description…" value={metadata} maxLength={1000} onChange={e => setMetadata(e.target.value)} /><select aria-label="Vector category" value={category} onChange={e => setCategory(e.target.value as Category)}>{CATEGORIES.filter(c => c.id !== 'doc').map(c => <option value={c.id} key={c.id}>{c.label}</option>)}</select><button className="btn-s" disabled={!!busy}>{busy === 'insert' ? 'INSERTING…' : '+ INSERT'}</button></form></Section>
        <Section title="Benchmark"><button className="btn-s" onClick={() => void runBenchmark()} disabled={!!busy}>{busy === 'benchmark' ? 'COMPARING…' : '▶ COMPARE ALL ALGOS'}</button></Section>
        <p className="muted">Session storage · inserted data resets when the API restarts.</p>
      </aside>
      <ScatterPlot items={items} hitIds={hitIds} hoverId={hoverId} queryLabel={queryLabel} loaded={loaded} />
      <aside className="right-panel" aria-label="Results and documents">
        <div className="tabs" role="tablist" aria-label="Workspace tabs">{(['search', 'docs', 'rag'] as const).map((value, i) => <button key={value} role="tab" id={`tab-button-${value}`} aria-selected={tab === value} aria-controls={`panel-${value}`} tabIndex={tab === value ? 0 : -1} className={`tab ${tab === value ? 'on' : ''}`} onClick={() => setTab(value)} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const values = ['search', 'docs', 'rag'] as const; const next = values[(i + (event.key === 'ArrowRight' ? 1 : 2)) % 3]; setTab(next); document.getElementById(`tab-button-${next}`)?.focus(); } }}>{['SEARCH', 'DOCUMENTS', 'ASK AI'][i]}</button>)}</div>
        <div id="panel-search" role="tabpanel" aria-labelledby="tab-button-search" className={`tab-content ${tab === 'search' ? 'on' : ''}`}>
          <Section title="Search Latency"><div className="lat-big">{result ? latency(result.latencyUs) : '—'}</div><div className="lat-sub">{result ? `${result.algo.toUpperCase()} · ${result.metric} · k=${k}` : 'No query yet'}</div></Section>
          <Section title="Top Matches"><div className="results">{result ? result.results.length ? result.results.map((hit, i) => <article key={hit.id} className="rcard" onMouseEnter={() => setHoverId(hit.id)} onMouseLeave={() => setHoverId(null)}><div className="rrank">#{i + 1} NEAREST</div><p className="rmeta">{hit.metadata}</p><div className="rfoot"><span className="rcat" style={{ background: COLORS[hit.category] + '18', color: COLORS[hit.category], border: `1px solid ${COLORS[hit.category]}44` }}>{hit.category.toUpperCase()}</span><span className="rdist">dist: {hit.distance.toFixed(5)}</span><button className="del" aria-label={`Delete vector ${hit.metadata}`} title={hit.documentId ? 'Remove map marker only; delete chunks in Documents' : 'Delete vector'} disabled={!!busy} onClick={() => void deleteVector(hit.id)}>×</button></div></article>) : <p className="muted">No results. Insert a vector to get started.</p> : <p className="muted">Run a search to see results…</p>}</div></Section>
          <Section title="Query Embedding (16D)"><EmbeddingChart embedding={embedding} /></Section>
          {benchmark && <Section title="Algorithm Comparison"><div className="bench">{[{ label: 'Brute Force', value: benchmark.bruteforceUs, color: '#f38ba8' }, { label: 'KD-Tree', value: benchmark.kdtreeUs, color: '#89dceb' }, { label: 'HNSW', value: benchmark.hnswUs, color: '#b388ff' }].map(row => <div className="brow" key={row.label}><div className="blabel"><span style={{ color: row.color }}>{row.label}</span><span>{latency(row.value)}</span></div><div className="btrack"><div className="bfill" style={{ width: `${Math.max(2, row.value / Math.max(benchmark.bruteforceUs, benchmark.kdtreeUs, benchmark.hnswUs, .001) * 100)}%`, background: row.color }} /></div></div>)}</div><p className="muted" style={{ marginTop: 8 }}>Median of 21 runs after warm-up · {benchmark.itemCount} vectors · search time only</p></Section>}
          <Section title="HNSW Graph Layers"><div className="layers">{graph ? graph.nodeCount ? graph.nodesPerLayer.map((count, i) => <div key={i} className="lrow"><span className="lnum">L{i}</span><div className="ltrack"><div className="lfill" style={{ width: `${Math.max(2, count / Math.max(1, graph.nodesPerLayer[0]) * 100)}%` }} /></div><span className="lcount">{count}n · {graph.edgesPerLayer[i]}e</span></div>) : <p className="muted">Empty index</p> : <p className="muted">Loading…</p>}</div></Section>
        </div>
        <div id="panel-docs" role="tabpanel" aria-labelledby="tab-button-docs" className={`tab-content ${tab === 'docs' ? 'on' : ''}`}>
          <Section title="Ollama Status"><div className={`ollama-status ${status?.modelsReady ? 'ok' : 'err'}`}><div className="status-head"><span style={{ color: status?.modelsReady ? 'var(--green)' : 'var(--red)' }}>● {status ? status.modelsReady ? 'Ready' : status.ollamaAvailable ? 'Models missing' : 'Offline' : 'Checking…'}</span><button className="status-refresh" disabled={!!busy} onClick={() => void perform('status', async () => { await Promise.all([refreshStatus(), refreshData()]); })}>Refresh</button></div><dl className="status-grid"><dt>Embed</dt><dd>{status?.embedModel || 'nomic-embed-text'}</dd><dt>Generate</dt><dd>{status?.genModel || 'llama3.2'}</dd><dt>Dimensions</dt><dd>{status?.docDims || 'Set on first insert'}</dd><dt>Chunks</dt><dd>{documents.length}</dd></dl>{status && !status.modelsReady && <p className="muted" style={{ marginTop: 8 }}>Start Ollama and install the models:<br /><code>ollama pull {status.embedModel}</code><br /><code>ollama pull {status.genModel}</code></p>}</div></Section>
          <Section title="Add a document">
            <form
              className="panel-stack"
              onSubmit={event => {
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

                <strong>
                  {pdfFile ? pdfFile.name : 'Bring your documents to life'}
                </strong>

                <span className="pdf-upload-description">
                  {pdfFile
                    ? `${(pdfFile.size / 1024 / 1024).toFixed(2)} MB · Ready to upload`
                    : 'Choose a PDF and ask questions about its content.'}
                </span>

                <span className="pdf-upload-action">
                  {pdfFile ? 'Change PDF' : 'Choose PDF'}
                </span>

                <input
                  ref={pdfInput}
                  className="sr-only"
                  type="file"
                  accept=".pdf,application/pdf"
                  aria-label="Upload PDF"
                  disabled={!!busy}
                  onChange={event => {
                    setPdfFile(event.target.files?.[0] || null);
                    setInsertStatus('');
                  }}
                />

                <span className="pdf-upload-limit">
                  Text-based PDF · Up to 10 MB
                </span>
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
                placeholder={
                  pdfFile ? 'Title — optional' : 'Give your notes a title'
                }
                value={title}
                maxLength={500}
                disabled={!!busy}
                onChange={event => setTitle(event.target.value)}
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
                    onChange={event => setDocText(event.target.value)}
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
                Scanned PDFs need OCR first. Documents stay available until
                the backend restarts.
              </p>

              {insertStatus && (
                <div className="document-success" role="status">
                  <strong>Your document is ready</strong>
                  <p>{insertStatus}</p>

                  <button
                    type="button"
                    className="btn-g"
                    onClick={() => setTab('rag')}
                  >
                    Ask about this document →
                  </button>
                </div>
              )}
            </form>
          </Section>
          <Section title={`Stored Chunks (${documents.length})`}><div className="doc-list">{documents.length ? documents.map(doc => <article className="dcard" key={doc.id}><p className="dcard-title">{doc.title}</p><p className="dcard-preview">{doc.preview}</p><div className="dcard-foot"><span className="dcard-words">{doc.words} words</span><button className="del" disabled={!!busy} aria-label={`Delete chunk ${doc.title}`} onClick={() => void deleteDocument(doc.id)}>×</button></div></article>) : <p className="muted">No documents yet. Insert some above.</p>}</div></Section>
        </div>
        <div id="panel-rag" role="tabpanel" aria-labelledby="tab-button-rag" className={`tab-content ${tab === 'rag' ? 'on' : ''}`}>
          <Section title="Ask a Question"><form className="panel-stack" onSubmit={e => { e.preventDefault(); void askAI(); }}><textarea aria-label="Question for AI" placeholder="What is dynamic programming?" rows={3} value={question} maxLength={10000} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void askAI(); } }} /><div className="inline-row"><select aria-label="Retrieved chunks" value={ragK} disabled={!!busy} onChange={e => setRagK(Number(e.target.value))}>{[2, 3, 5].map(n => <option key={n} value={n}>Top {n}</option>)}</select><button className="btn-g" disabled={!!busy}>{busy === 'ask' ? 'THINKING…' : '🤖 ASK AI'}</button></div><p className="muted">Uses your documents when relevant; otherwise the local model may answer from general knowledge.</p></form></Section>
          <Section title="Conversation"><div className="chat-history" aria-live="polite">{asked && <p className="chat-q">{asked}</p>}{busy === 'ask' && <div className="thinking" role="status"><span className="spinner" />Retrieving context & generating answer…</div>}{answer && <article className="chat-a"><div className="chat-a-label">🤖 {answer.model}</div><TypedAnswer text={answer.answer} /><div className="chat-ctx"><div className="chat-ctx-label">RETRIEVED CONTEXT ({answer.contexts.length} chunks)</div>{answer.contexts.map((context, i) => <details key={context.id}><summary className="ctx-chip">#{i + 1} {context.title} · {context.distance.toFixed(3)}</summary><p className="ctx-expand">{context.text}</p></details>)}{!answer.contexts.length && <p className="muted">No document chunks met the similarity threshold. This answer uses general knowledge.</p>}</div></article>}{!asked && <p className="muted">Ask a question about your inserted documents…</p>}</div></Section>
        </div>
      </aside>
    </main>
  </div>;
}
