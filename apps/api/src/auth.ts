import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPool } from './database.ts';
import { ApiError } from './ollama.ts';
import { requestContext } from './request-context.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieName =
  process.env.NODE_ENV === 'production' ? '__Host-vectordb_session' : 'vectordb_session';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(256),
});
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}
async function verifyPassword(password: string, stored: string | null) {
  const [salt, expected] = (stored ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex')) && stored !== null;
}
function token(req: Request) {
  return (
    (req.headers.cookie ?? '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) ?? ''
  );
}
async function session(req: Request) {
  const raw = token(req);
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const result = await getPool().query(
    'SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
    [hash(raw)],
  );
  return result.rows[0] ?? null;
}
async function issueSession(req: Request, res: Response, user: { id: string; email: string }) {
  const raw = randomBytes(32).toString('hex');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sessions WHERE token_hash=$1 OR expires_at<=now()', [
      hash(token(req)),
    ]);
    await client.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [hash(raw), user.id],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.cookie(cookieName, raw, { ...cookieOptions, maxAge: 7 * 86400000 });
  res.json({ user });
}
export function installAuth(app: Express) {
  // Mandatory custom header + strict origin allowlist prevents form/login CSRF.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const allowed = process.env.WEB_ORIGIN || 'http://localhost:3000';
      if (
        req.get('X-Requested-With') !== 'VectorDB' ||
        (req.headers.origin && req.headers.origin !== allowed)
      ) {
        return next(new ApiError('Request origin or CSRF header is invalid.', 403));
      }
    }
    next();
  });
  app.use(['/auth/login', '/auth/register'], async (req, _res, next) => {
    if (req.method !== 'POST') return next();
    // Database-backed counter works across API workers and restarts.
    const key = hash(req.ip ?? 'unknown');
    await getPool().query('DELETE FROM auth_attempts WHERE expires_at<=now()');
    const result = await getPool().query(
      `INSERT INTO auth_attempts(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes')
      ON CONFLICT(key) DO UPDATE SET attempts=auth_attempts.attempts+1 RETURNING attempts`,
      [key],
    );
    if (result.rows[0].attempts > 20)
      throw new ApiError('Too many login attempts. Try again in 15 minutes.', 429);
    next();
  });
  app.post('/auth/register', async (req, res) => {
    const data = credentials.parse(req.body);
    const passwordHash = await hashPassword(data.password);
    const result = await getPool().query(
      'INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id,email',
      [randomUUID(), data.email, passwordHash],
    );
    if (!result.rows.length) throw new ApiError('Unable to register this email.', 409);
    res.status(201);
    await issueSession(req, res, result.rows[0]);
  });
  app.post('/auth/login', async (req, res) => {
    const data = credentials.parse(req.body);
    const result = await getPool().query(
      'SELECT id,email,password_hash FROM users WHERE email=$1',
      [data.email],
    );
    const user = result.rows[0];
    if (!(await verifyPassword(data.password, user?.password_hash ?? null)))
      throw new ApiError('Invalid email or password.', 401);
    await issueSession(req, res, { id: user.id, email: user.email });
  });
  app.post('/auth/logout', async (req, res) => {
    await getPool().query('DELETE FROM sessions WHERE token_hash=$1', [hash(token(req))]);
    res.clearCookie(cookieName, cookieOptions).json({ ok: true });
  });
  app.get('/auth/me', async (req, res) => {
    const user = await session(req);
    if (!user) throw new ApiError('Please sign in.', 401);
    res.json({ user });
  });
  app.use(async (req, _res, next) => {
    const user = await session(req);
    if (!user) throw new ApiError('Session expired. Please sign in.', 401);
    requestContext.run({ userId: user.id }, next);
  });
}
