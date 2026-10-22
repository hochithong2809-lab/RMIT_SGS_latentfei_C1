import { createHash, randomBytes } from 'node:crypto';
import { getStore, type Actor, type Store } from '../store';
import { authMode } from './mode';
import { DEMO_ACCOUNTS, demoActor } from './demo-data';

export const DEMO_COOKIE = 'teamvault_demo_session';
const SESSION_SECONDS = 4 * 60 * 60;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

function cookieToken(req: Request): string | null {
  const token = (req.headers.get('cookie') || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(DEMO_COOKIE + '='))?.slice(DEMO_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function sameOrigin(req: Request): boolean {
  // Next may normalize req.url to its configured hostname. Compare the browser's
  // origin with the actual Host header, never an untrusted X-Forwarded-* value.
  const expected = new URL(req.url);
  const host = req.headers.get('host');
  if (host) expected.host = host;
  return req.headers.get('origin') === expected.origin;
}

export function demoIdentity(req: Request, store: Store = getStore()): Actor | null {
  if (authMode() !== 'demo') return null;
  const token = cookieToken(req);
  if (!token) return null;
  const session = store.db.prepare('SELECT subject,expires_at FROM demo_sessions WHERE token_hash=?')
    .get(digest(token)) as { subject: string; expires_at: number } | undefined;
  if (!session || session.expires_at <= Date.now()) return null;
  const account = DEMO_ACCOUNTS.find(a => a.sub === session.subject);
  return account ? demoActor(account) : null;
}

function sessionCookie(req: Request, value: string, age: number) {
  return `${DEMO_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}

// Development identity selection, not a Tide token, OIDC flow, password check or DPoP proof.
export async function demoSession(req: Request, store?: Store): Promise<Response> {
  if (authMode() !== 'demo') return Response.json({ error: 'Not found.' }, { status: 404 });
  store ??= getStore();
  const headers = { 'Cache-Control': 'no-store' };
  if (req.method === 'GET') {
    const actor = demoIdentity(req, store);
    return Response.json({ mode: 'demo', user: actor, accounts: DEMO_ACCOUNTS.map(({ id, name, caption, description }) => ({ id, name, caption, description })) }, { headers });
  }
  if (!sameOrigin(req)) return Response.json({ error: 'Same-origin request required.' }, { status: 403, headers });
  if (req.method === 'DELETE') {
    const token = cookieToken(req);
    if (token) store.db.prepare('DELETE FROM demo_sessions WHERE token_hash=?').run(digest(token));
    return Response.json({ ok: true }, { headers: { ...headers, 'Set-Cookie': sessionCookie(req, '', 0) } });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  const raw = await req.text();
  if (raw.length > 1024) return Response.json({ error: 'Request too large.' }, { status: 413, headers });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400, headers }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('accountId' in body)) {
    return Response.json({ error: 'Choose one predefined demo account.' }, { status: 400, headers });
  }
  const account = DEMO_ACCOUNTS.find(a => a.id === body.accountId);
  if (!account) return Response.json({ error: 'Unknown demo account.' }, { status: 400, headers });
  const token = randomBytes(32).toString('base64url');
  store.transaction(() => {
    const previous = cookieToken(req);
    if (previous) store!.db.prepare('DELETE FROM demo_sessions WHERE token_hash=?').run(digest(previous));
    store!.db.prepare('DELETE FROM demo_sessions WHERE expires_at<=?').run(Date.now());
    store!.db.prepare('INSERT INTO demo_sessions VALUES (?,?,?)').run(digest(token), account.sub, Date.now() + SESSION_SECONDS * 1000);
  });
  return Response.json({ mode: 'demo', user: demoActor(account) }, { headers: { ...headers, 'Set-Cookie': sessionCookie(req, token, SESSION_SECONDS) } });
}
