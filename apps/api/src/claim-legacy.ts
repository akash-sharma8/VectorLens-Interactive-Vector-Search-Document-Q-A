import 'dotenv/config';
import { getPool, closeDatabase } from './database.ts';
const email = process.argv[2]?.trim().toLowerCase();
if (!email)
  throw new Error('Usage: npm run db:claim-legacy -w @vectordb/api -- your-registered-email');
const client = await getPool().connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(842031)');
  const user = (
    await client.query('SELECT id FROM users WHERE email=$1 AND password_hash IS NOT NULL', [email])
  ).rows[0];
  if (!user) throw new Error('Register the destination account before claiming legacy data.');
  // Composite marker ownership FK requires moving both tables together.
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  const docs = await client.query(
    "UPDATE documents SET user_id=$1 WHERE user_id='00000000-0000-0000-0000-000000000001' RETURNING id",
    [user.id],
  );
  const vectors = await client.query(
    "UPDATE demo_vectors SET user_id=$1 WHERE user_id='00000000-0000-0000-0000-000000000001' RETURNING id",
    [user.id],
  );
  await client.query(
    "INSERT INTO app_metadata(key,value) VALUES($1,'complete') ON CONFLICT DO NOTHING",
    ['demo_seed_v1:' + user.id],
  );
  await client.query('COMMIT');
  console.log(
    `Transferred ${docs.rowCount} documents and ${vectors.rowCount} vectors. Original IDs preserved.`,
  );
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await closeDatabase();
}
