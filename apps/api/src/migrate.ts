import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getPool, closeDatabase } from './database.ts';

async function migrate() {
  const directory = new URL('../migrations/', import.meta.url);

  const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    // Prevent two migration commands from changing the schema together.
    await client.query('SELECT pg_advisory_xact_lock(842031)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const name of files) {
      const sql = await readFile(new URL(name, directory), 'utf8');

      const checksum = createHash('sha256').update(sql).digest('hex');

      const previous = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [name],
      );

      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum) {
          throw new Error(
            `${name} was modified after being applied. ` + 'Create a new migration instead.',
          );
        }

        console.log(`Skipped: ${name}`);
        continue;
      }

      await client.query(sql);

      await client.query(
        `INSERT INTO schema_migrations (name, checksum)
         VALUES ($1, $2)`,
        [name, checksum],
      );

      console.log(`Applied: ${name}`);
    }

    await client.query('COMMIT');
    console.log('Database migrations complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

try {
  await migrate();
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : 'Unknown error');

  process.exitCode = 1;
} finally {
  await closeDatabase();
}
