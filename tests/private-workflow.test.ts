import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { createApp } from '../apps/api/src/app.ts';
import { closeDatabase, getPool } from '../apps/api/src/database.ts';
import { ApiError, type AIProvider } from '../apps/api/src/ollama.ts';

class FixtureAI implements AIProvider {
  embedModel = 'integration-embed';
  genModel = 'integration-generate';
  failEmbed = false;
  failGenerate = false;
  generated = 0;
  prompts: string[] = [];
  barrier?: () => Promise<void>;
  async status() {
    return { available: true, missingModels: [] };
  }
  async embed(text: string) {
    if (this.failEmbed) throw new ApiError('Embedding provider unavailable.', 503);
    return /unrelated/i.test(text)
      ? [-1, 0, 0]
      : /recipe|cooking/i.test(text)
        ? [0, 1, 0]
        : [1, 0, 0];
  }
  async generate(prompt: string) {
    await this.barrier?.();
    this.generated++;
    this.prompts.push(prompt);
    if (this.failGenerate) throw new ApiError('Generation provider unavailable.', 503);
    return prompt.startsWith('Rewrite')
      ? 'What is binary search time complexity?'
      : 'Binary search takes O(log n) time [1].';
  }
}
import { pdfFixture } from './fixtures/pdf.ts';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('PostgreSQL private workflow integration', () => {
  const schema = 'integration_' + randomUUID().replaceAll('-', '');
  const ai = new FixtureAI();
  let admin: pg.Pool;
  let server: Server;
  let origin: string;
  let cookieA = '',
    cookieB = '',
    userA = '';
  let algorithms: any, cooking: any, conversation: any;
  let originalDatabaseUrl = process.env.DATABASE_URL;
  async function start() {
    const built = createApp(ai);
    await built.initializeDocuments();
    server = await new Promise<Server>((resolve) => {
      const s = built.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  async function stop() {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
  }
  async function req(
    path: string,
    body?: unknown,
    method?: string,
    cookie = cookieA,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(origin + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        'Content-Type': Buffer.isBuffer(body) ? 'application/pdf' : 'application/json',
        'X-Requested-With': 'VectorDB',
        Cookie: cookie,
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : Buffer.isBuffer(body)
            ? new Uint8Array(body)
            : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
      headers: response.headers,
    };
  }
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (!url.pathname.endsWith('_test'))
      throw new Error('TEST_DATABASE_URL must target a separate database ending in _test.');
    if (originalDatabaseUrl && new URL(originalDatabaseUrl).pathname === url.pathname)
      throw new Error('Test database must differ from DATABASE_URL.');
    admin = new pg.Pool({ connectionString: testUrl });
    await admin.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
    await admin.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString();
    await closeDatabase();
    for (const file of (await readdir('apps/api/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (file.startsWith('003')) {
        await getPool().query(
          "INSERT INTO documents(title,source_type,content,embedding_model,embedding_dimensions) VALUES('Legacy notes','text','Legacy private content','integration-embed',3)",
        );
        await getPool().query(
          "INSERT INTO document_chunks(document_id,chunk_index,text,word_count,embedding_dimensions,embedding) VALUES(1,0,'Legacy private content',3,3,'[1,0,0]'::vector)",
        );
        await getPool().query(
          "INSERT INTO demo_vectors(metadata,category,embedding,document_id) VALUES('Legacy notes','doc',$1,1)",
          [Array(16).fill(0.5)],
        );
      }
      await getPool().query(await readFile(`apps/api/migrations/${file}`, 'utf8'));
    }
    await start();
  }, 30000);
  afterAll(async () => {
    await stop();
    await closeDatabase();
    process.env.DATABASE_URL = originalDatabaseUrl;
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
  it('requires auth, rejects CSRF, creates hashed sessions and two private accounts', async () => {
    expect((await req('/items', undefined, undefined, '')).status).toBe(401);
    expect(
      (
        await req(
          '/auth/register',
          { email: 'a@example.com', password: 'long-password-A' },
          undefined,
          '',
          { 'X-Requested-With': '' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await req(
          '/auth/register',
          { email: 'a@example.com', password: 'long-password-A' },
          undefined,
          '',
          { Origin: 'https://evil.example' },
        )
      ).status,
    ).toBe(403);
    const a = await req(
      '/auth/register',
      { email: 'a@example.com', password: 'long-password-A' },
      undefined,
      '',
    );
    expect(a.status).toBe(201);
    cookieA = a.cookie;
    userA = a.data.user.id;
    expect(a.headers.get('set-cookie')).toContain('HttpOnly');
    expect(a.headers.get('set-cookie')).toContain('SameSite=Lax');
    const b = await req(
      '/auth/register',
      { email: 'b@example.com', password: 'long-password-B' },
      undefined,
      '',
    );
    expect(b.status).toBe(201);
    cookieB = b.cookie;
    const stored = (await getPool().query('SELECT password_hash FROM users WHERE id=$1', [userA]))
      .rows[0];
    expect(stored.password_hash).not.toContain('long-password');
    expect(
      (await getPool().query('SELECT token_hash FROM sessions')).rows.every(
        (r) => !cookieA.includes(r.token_hash),
      ),
    ).toBe(true);
    expect(
      (
        await req(
          '/auth/login',
          { email: 'a@example.com', password: 'wrong-password' },
          undefined,
          '',
        )
      ).status,
    ).toBe(401);
  });
  it('uploads two topic PDFs with chunks, embeddings, page references and owned markers', async () => {
    algorithms = (
      await req(
        '/doc/upload?title=Algorithms&filename=algorithms.pdf',
        pdfFixture([
          'Binary search halves a sorted list.',
          'Binary search takes logarithmic time.',
        ]),
      )
    ).data;
    cooking = (
      await req(
        '/doc/upload?title=Cooking&filename=cooking.pdf',
        pdfFixture([
          'Cooking recipe uses flour and water.',
          'Recipe ingredients are mixed and baked.',
        ]),
      )
    ).data;
    expect(algorithms.pages).toBe(2);
    expect(algorithms.chunks).toBeGreaterThan(0);
    expect(cooking.documentId).not.toBe(algorithms.documentId);
    expect(algorithms.chunkDetails[0]).toMatchObject({ pageStart: 1, pageEnd: 2 });
    const rows = (
      await getPool().query(
        'SELECT vector_dims(embedding) AS dims FROM document_chunks WHERE document_id=$1',
        [algorithms.documentId],
      )
    ).rows;
    expect(rows[0].dims).toBe(3);
    expect((await req('/doc/list')).data).toHaveLength(algorithms.chunks + cooking.chunks);
    expect((await req('/doc/list', undefined, undefined, cookieB)).data).toEqual([]);
  });
  it('scopes selected search and all in-memory indexes, rejects guessed IDs', async () => {
    const result = await req('/doc/search', {
      question: 'binary search',
      documentIds: [algorithms.documentId],
    });
    expect(result.status).toBe(200);
    expect(result.data.contexts.length).toBeGreaterThan(0);
    expect(result.data.contexts.every((c: any) => c.documentId === algorithms.documentId)).toBe(
      true,
    );
    for (const endpoint of ['/doc/search', '/doc/ask'])
      expect(
        (
          await req(
            endpoint,
            { question: 'binary search', documentIds: [algorithms.documentId] },
            undefined,
            cookieB,
          )
        ).status,
      ).toBe(404);
    expect(
      (await req(`/doc/delete/${algorithms.ids[0]}`, undefined, 'DELETE', cookieB)).data.ok,
    ).toBe(false);
    expect(
      (await req(`/delete/${algorithms.markerId}`, undefined, 'DELETE', cookieB)).data.ok,
    ).toBe(false);
    const privateVector = (
      await req('/insert', {
        metadata: 'private-A',
        category: 'cs',
        embedding: Array(16).fill(0.5),
      })
    ).data;
    const bItems = (await req('/items', undefined, undefined, cookieB)).data;
    expect(
      bItems.some((v: any) => v.id === privateVector.id || v.documentId === algorithms.documentId),
    ).toBe(false);
    const bSearch = (
      await req('/search?v=' + Array(16).fill(0.5).join(','), undefined, undefined, cookieB)
    ).data;
    expect(bSearch.results.some((v: any) => v.id === privateVector.id)).toBe(false);
    expect((await req('/hnsw-info', undefined, undefined, cookieB)).data.nodeCount).toBe(20);
  });
  it('skips generation on unrelated document-only questions and rolls back bad ingestion', async () => {
    const before = ai.generated;
    const answer = await req('/doc/ask', {
      question: 'unrelated question',
      documentIds: [algorithms.documentId],
      documentsOnly: true,
    });
    expect(answer.data.generated).toBe(false);
    expect(ai.generated).toBe(before);
    const count = (await req('/doc/list')).data.length;
    expect((await req('/doc/upload?title=invalid', Buffer.from('not a PDF'))).status).toBe(400);
    ai.failEmbed = true;
    expect((await req('/doc/upload?title=failed', pdfFixture(['Binary search PDF.']))).status).toBe(
      503,
    );
    ai.failEmbed = false;
    expect((await req('/doc/list')).data).toHaveLength(count);
    expect(
      (await getPool().query("SELECT id FROM documents WHERE title IN ('invalid','failed')")).rows,
    ).toEqual([]);
  });
  it('persists message settings and source snapshots, handles duplicates and follow-ups', async () => {
    conversation = (await req('/conversations', { title: 'Search notes' })).data;
    const payload = {
      question: 'What is binary search?',
      requestId: randomUUID(),
      documentIds: [algorithms.documentId],
      documentsOnly: true,
    };
    const result = await req(`/conversations/${conversation.id}/messages`, payload);
    expect(result.status).toBe(200);
    expect(result.data.messages).toHaveLength(2);
    expect(result.data.messages[1].contexts[0].pageStart).toBe(1);
    const before = ai.generated;
    expect(
      (await req(`/conversations/${conversation.id}/messages`, payload)).data.messages,
    ).toHaveLength(2);
    expect(ai.generated).toBe(before);
    expect(
      (
        await req(`/conversations/${conversation.id}/messages`, {
          ...payload,
          question: 'different',
        })
      ).status,
    ).toBe(409);
    const follow = await req(`/conversations/${conversation.id}/messages`, {
      ...payload,
      question: 'Its time complexity?',
      requestId: randomUUID(),
    });
    expect(follow.status).toBe(200);
    expect(follow.data.messages).toHaveLength(4);
    expect(
      ai.prompts.some((p) => p.startsWith('Rewrite') && p.includes('What is binary search?')),
    ).toBe(true);
    for (const [path, body, method] of [
      [`/conversations/${conversation.id}/messages`, undefined, 'GET'],
      [`/conversations/${conversation.id}/messages`, payload, 'POST'],
      [`/conversations/${conversation.id}`, { title: 'stolen' }, 'PATCH'],
      [`/conversations/${conversation.id}`, undefined, 'DELETE'],
    ] as const)
      expect((await req(path, body, method, cookieB)).status).toBe(404);
    expect((await req('/conversations', undefined, undefined, cookieB)).data).toEqual([]);
  });
  it('serializes concurrent submissions and recovers interrupted pending messages', async () => {
    const chat = (await req('/conversations', { title: 'Concurrency' })).data;
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    ai.barrier = async () => {
      entered();
      await barrier;
    };
    const payload = {
      question: 'Binary search',
      requestId: randomUUID(),
      documentsOnly: false,
      k: 3,
    };
    const first = req(`/conversations/${chat.id}/messages`, payload);
    await ready;
    try {
      expect((await req(`/conversations/${chat.id}/messages`, payload)).status).toBe(409);
    } finally {
      ai.barrier = undefined;
      release();
    }
    expect((await first).status).toBe(200);
    expect((await req(`/conversations/${chat.id}/messages`, payload)).data.messages).toHaveLength(
      2,
    );
    const interrupted = randomUUID();
    await getPool().query(
      "INSERT INTO messages(id,conversation_id,role,content,status,request_id,settings) VALUES($1,$2,'user','Interrupted question','pending',$3,$4)",
      [randomUUID(), chat.id, interrupted, { documentIds: null, documentsOnly: false, k: 3 }],
    );
    const recovered = await req(`/conversations/${chat.id}/messages`, {
      question: 'Interrupted question',
      requestId: interrupted,
      retry: true,
    });
    expect(recovered.status).toBe(200);
    expect(recovered.data.messages).toHaveLength(4);
    await req(`/conversations/${chat.id}`, undefined, 'DELETE');
  });
  it('retains failed user messages and retries without duplicating them', async () => {
    ai.failGenerate = true;
    const payload = {
      question: 'Explain binary search again',
      requestId: randomUUID(),
      documentIds: [algorithms.documentId],
      documentsOnly: true,
    };
    expect((await req(`/conversations/${conversation.id}/messages`, payload)).status).toBe(503);
    let rows = (await req(`/conversations/${conversation.id}/messages`)).data;
    expect(rows.at(-1).status).toBe('failed');
    expect(rows).toHaveLength(5);
    ai.failGenerate = false;
    rows = (await req(`/conversations/${conversation.id}/messages`, { ...payload, retry: true }))
      .data.messages;
    expect(rows).toHaveLength(6);
    expect(
      rows.filter((m: any) => m.role === 'user' && m.request_id === payload.requestId),
    ).toHaveLength(1);
  });
  it('restores identical documents, vectors, sessions and conversations after API/pool restart', async () => {
    const items = (await req('/items')).data,
      docs = (await req('/doc/list')).data;
    await stop();
    await closeDatabase();
    if (process.env.RESTART_TEST_DATABASE === '1') {
      const target = new URL(testUrl!);
      if (target.hostname !== '127.0.0.1' || target.port !== '5434')
        throw new Error(
          'Database restart is restricted to the dedicated compose.test.yml service on port 5434.',
        );
      await admin.end();
      await promisify(execFile)('docker', ['restart', 'vectordb-verification-test']);
      admin = new pg.Pool({ connectionString: testUrl });
      const probe = new pg.Pool({ connectionString: testUrl });
      for (let attempt = 0; ; attempt++) {
        try {
          await probe.query('SELECT 1');
          break;
        } catch (e) {
          if (attempt === 30) throw e;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      await probe.end();
    }
    await start();
    expect((await req('/items')).data).toEqual(items);
    expect((await req('/doc/list')).data).toEqual(docs);
    expect((await req(`/conversations/${conversation.id}/messages`)).data).toHaveLength(6);
    expect((await req('/auth/me')).data.user.id).toBe(userA);
  }, 30000);
  it('removes only the last chunk parent and marker; retains old citation text', async () => {
    const doc = (
      await req('/doc/insert', { title: 'Multi-chunk', text: Array(500).fill('binary').join(' ') })
    ).data;
    expect(doc.chunks).toBeGreaterThan(1);
    await req(`/doc/delete/${doc.ids[0]}`, undefined, 'DELETE');
    expect((await req('/items')).data.some((v: any) => v.id === doc.markerId)).toBe(true);
    for (const id of doc.ids.slice(1)) await req(`/doc/delete/${id}`, undefined, 'DELETE');
    expect((await req('/items')).data.some((v: any) => v.id === doc.markerId)).toBe(false);
    for (const id of algorithms.ids) await req(`/doc/delete/${id}`, undefined, 'DELETE');
    const rows = (await req(`/conversations/${conversation.id}/messages`)).data;
    expect(rows[1].contexts[0].deleted).toBe(true);
    expect(rows[1].contexts[0].text).toContain('Binary search');
    expect(
      (await req('/doc/list')).data.every((c: any) => c.documentId === cooking.documentId),
    ).toBe(true);
  });
  it('renames/deletes conversations and restores history after logout/login; expires sessions', async () => {
    expect(
      (await req(`/conversations/${conversation.id}`, { title: 'Renamed' }, 'PATCH')).data.title,
    ).toBe('Renamed');
    const old = cookieA;
    await req('/auth/logout', {});
    expect((await req('/conversations', undefined, undefined, old)).status).toBe(401);
    const login = await req(
      '/auth/login',
      { email: 'a@example.com', password: 'long-password-A' },
      undefined,
      '',
    );
    cookieA = login.cookie;
    expect((await req(`/conversations/${conversation.id}/messages`)).data).toHaveLength(6);
    expect((await req(`/conversations/${conversation.id}`, undefined, 'DELETE')).status).toBe(200);
    expect((await getPool().query('SELECT * FROM message_sources')).rows).toEqual([]);
    await getPool().query('UPDATE sessions SET expires_at=now() WHERE user_id=$1', [userA]);
    expect((await req('/items')).status).toBe(401);
  });
  it('quarantines and explicitly transfers legacy rows without changing their IDs', async () => {
    expect((await req('/doc/list', undefined, undefined, cookieB)).data).toEqual([]);
    const legacy = (await getPool().query('SELECT user_id FROM documents WHERE id=1')).rows[0];
    expect(legacy.user_id).toBe('00000000-0000-0000-0000-000000000001');
    await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'apps/api/src/claim-legacy.ts', 'b@example.com'],
      { env: process.env },
    );
    const rows = (await req('/doc/list', undefined, undefined, cookieB)).data;
    expect(rows[0]).toMatchObject({ id: 1, documentId: 1, title: 'Legacy notes' });
    expect(
      (await req('/items', undefined, undefined, cookieB)).data.some(
        (v: any) => v.id === 1 && v.documentId === 1,
      ),
    ).toBe(true);
    expect(
      (await getPool().query('SELECT count(*)::integer AS n FROM documents WHERE user_id IS NULL'))
        .rows[0].n,
    ).toBe(0);
  });
  it('rate-limits repeated authentication attempts', async () => {
    await getPool().query('UPDATE auth_attempts SET attempts=20');
    expect(
      (
        await req(
          '/auth/login',
          { email: 'b@example.com', password: 'long-password-B' },
          undefined,
          '',
        )
      ).status,
    ).toBe(429);
  });
});
