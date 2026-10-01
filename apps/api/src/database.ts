import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | undefined;
let chatLockPool: pg.Pool | undefined;

// Long-running generation holds an advisory lock connection. Keep those apart
// from normal queries so concurrent chats cannot exhaust the retrieval pool.
export function getChatLockPool(): pg.Pool {
  if (!chatLockPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
    chatLockPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000,
    });
    chatLockPool.on('error', (error) =>
      console.error('Chat database connection error:', error.message),
    );
  }
  return chatLockPool;
}

export function getPool(): pg.Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is missing in apps/api/.env');
  }

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  pool.on('error', (error) => {
    console.error('PostgreSQL idle connection error:', error.message);
  });

  return pool;
}

export async function checkDatabase() {
  const result = await getPool().query<{
    database: string;
    vector_version: string | null;
  }>(`
    SELECT
      current_database() AS database,
      (
        SELECT extversion
        FROM pg_extension
        WHERE extname = 'vector'
      ) AS vector_version
  `);

  const info = result.rows[0];

  if (!info?.vector_version) {
    throw new Error('pgvector extension is not enabled.');
  }

  return info;
}

export async function closeDatabase() {
  if (chatLockPool) {
    await chatLockPool.end();
    chatLockPool = undefined;
  }
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
