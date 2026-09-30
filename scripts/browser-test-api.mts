// Isolated browser test API. Never points at the application database.
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import pg from 'pg';
import { getPool,closeDatabase } from '../apps/api/src/database.ts';
import { createApp } from '../apps/api/src/app.ts';
const raw=process.env.TEST_DATABASE_URL;
if(!raw || !new URL(raw).pathname.endsWith('_test'))throw new Error('Set TEST_DATABASE_URL to a separate database ending in _test.');
if(process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname===new URL(raw).pathname)throw new Error('Test and application databases must differ.');
const admin=new pg.Pool({connectionString:raw});
const schema='browser_'+randomUUID().replaceAll('-','');
await admin.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
await admin.query(`CREATE SCHEMA ${schema}`);
const url=new URL(raw);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.toString();
for(const file of (await readdir('apps/api/migrations')).filter(f=>f.endsWith('.sql')).sort())await getPool().query(await readFile(`apps/api/migrations/${file}`,'utf8'));
const {app,initializeDocuments}=createApp();await initializeDocuments();
const server=app.listen(18080,'127.0.0.1');
let closing=false;
async function cleanup(){if(closing)return;closing=true;server.close();await closeDatabase();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();process.exit(0);}
process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);
