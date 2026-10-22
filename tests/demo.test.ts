import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';
import { Store, getStore } from '../src/lib/store';
import { seedDemo } from '../src/lib/auth/demo-data';
import { demoSession, demoIdentity, sameOrigin } from '../src/lib/auth/demo';
import { withIdentity } from '../src/lib/auth/identity';
import { dispatch } from '../src/lib/api';

mkdirSync('test-results', { recursive: true });
const dir = mkdtempSync(join(process.cwd(), 'test-results/demo-'));
process.env.TEAMVAULT_AUTH_MODE = 'demo';
process.env.TEAMVAULT_DEMO_DB = join(dir, 'demo.sqlite');
process.env.TEAMVAULT_DB = join(dir, 'never-use-live.sqlite');
const store = getStore();
after(() => store.close());
const origin = 'http://localhost:3000';
const request = (path: string, method = 'GET', body?: unknown, cookie?: string, custom?: Record<string, string>) => new Request(origin + path, {
  method, headers: { ...(cookie ? { cookie } : {}), ...(method === 'GET' ? {} : { origin, 'Content-Type': 'application/json' }), ...custom },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}) as NextRequest;
async function signIn(accountId: string, current?: string) {
  const response = await demoSession(request('/api/auth/session', 'POST', { accountId }, current));
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
const api = withIdentity((req, actor) => dispatch(req, actor, store));

test('demo seeds once, keeps admin changes and uses a separate database', () => {
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM submissions').get()!.n, 4);
  assert.equal(existsSync(process.env.TEAMVAULT_DB!), false);
  const s = new Store(':memory:'); seedDemo(s);
  s.db.prepare('DELETE FROM memberships WHERE subject=?').run('demo-member-alpha');
  seedDemo(s);
  assert.equal(s.team('demo-member-alpha'), undefined);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM submissions').get()!.n, 4);
  s.close();
});

test('demo authentication requires an opaque server session; untrusted role headers do nothing', async () => {
  assert.equal((await api(request('/api/me'))).status, 401);
  const cookie = await signIn('member-alpha');
  const response = await api(request('/api/me', 'GET', undefined, cookie, { 'x-role': 'admin', 'x-user-id': 'demo-admin' }));
  const actor = await response.json();
  assert.equal(actor.sub, 'demo-member-alpha'); assert.deepEqual(actor.roles, ['member']);
  assert.equal(actor.team_id, 'alpha');
  const token = cookie.slice(cookie.indexOf('=') + 1);
  assert.equal(store.db.prepare('SELECT token_hash FROM demo_sessions WHERE token_hash=?').get(token), undefined);
  const tampered = cookie.slice(0, -1) + (cookie.endsWith('x') ? 'y' : 'x');
  assert.equal((await api(request('/api/me', 'GET', undefined, tampered))).status, 401);
});

test('only fixed demo accounts are accepted, with no caller-supplied role or identity', async () => {
  for (const body of [{ accountId: 'unknown' }, { accountId: 'member-alpha', role: 'admin' }, { sub: 'demo-admin' }, []]) {
    assert.equal((await demoSession(request('/api/auth/session', 'POST', body))).status, 400);
  }
  const response = await demoSession(request('/api/auth/session', 'POST', { accountId: 'admin' }));
  assert.match(response.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
  assert.equal((await response.json()).user.roles[0], 'admin');
});

test('server denies member admin access, cross-team access and unassigned reviews', async () => {
  const a = await signIn('member-alpha'), b = await signIn('member-beta'), r = await signIn('reviewer'), admin = await signIn('admin');
  assert.equal((await api(request('/api/admin/teams', 'GET', undefined, a))).status, 403);
  assert.equal((await api(request('/api/submissions/demo-campus-compass', 'GET', undefined, b))).status, 404);
  assert.equal((await api(request('/api/submissions/demo-campus-compass', 'GET', undefined, r))).status, 404);
  assert.equal((await api(request('/api/submissions/demo-green-loop/review', 'POST', { decision: 'APPROVED', feedback: 'No assignment' }, r))).status, 404);
  assert.equal((await api(request('/api/submissions/demo-open-study/review', 'POST', { decision: 'APPROVED', feedback: 'Admin alone' }, admin))).status, 403);
  assert.equal((await (await api(request('/api/submissions', 'GET', undefined, a))).json()).submissions.length, 2);
  assert.equal((await (await api(request('/api/submissions', 'GET', undefined, b))).json()).submissions.length, 2);
  assert.equal((await (await api(request('/api/submissions', 'GET', undefined, r))).json()).submissions.length, 1);
});

test('demo rejects cross-origin sign-in and cookie-authenticated mutations', async () => {
  assert.equal(sameOrigin(new Request(origin + '/api/me', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })), true);
  assert.equal(sameOrigin(new Request(origin + '/api/me', { headers: { host: 'localhost:3000', origin: 'https://other.example', 'x-forwarded-host': 'other.example' } })), false);
  const cookie = await signIn('admin');
  assert.equal((await demoSession(request('/api/auth/session', 'POST', { accountId: 'admin' }, undefined, { origin: 'https://other.example' }))).status, 403);
  assert.equal((await api(request('/api/admin/teams', 'POST', { action: 'create', name: 'CSRF team' }, cookie, { origin: 'https://other.example' }))).status, 403);
});

test('sign-out revokes the session and expired sessions are denied', async () => {
  const cookie = await signIn('member-alpha');
  assert.ok(demoIdentity(request('/api/me', 'GET', undefined, cookie)));
  await demoSession(request('/api/auth/session', 'DELETE', undefined, cookie));
  assert.equal((await api(request('/api/me', 'GET', undefined, cookie))).status, 401);
  const expired = await signIn('member-beta');
  store.db.prepare('UPDATE demo_sessions SET expires_at=0 WHERE subject=?').run('demo-member-beta');
  assert.equal((await api(request('/api/me', 'GET', undefined, expired))).status, 401);
});

test('switching sample accounts invalidates the previous session', async () => {
  const before = await signIn('member-alpha');
  const after = await signIn('reviewer', before);
  assert.equal((await api(request('/api/me', 'GET', undefined, before))).status, 401);
  assert.equal((await (await api(request('/api/me', 'GET', undefined, after))).json()).sub, 'demo-reviewer');
});

test('Tide mode does not expose demo sign-in or fall back to demo cookies', async () => {
  const cookie = await signIn('admin');
  process.env.TEAMVAULT_AUTH_MODE = 'tide';
  try {
    assert.equal((await demoSession(request('/api/auth/session'), store)).status, 404);
    assert.equal((await api(request('/api/me', 'GET', undefined, cookie))).status, 401);
  } finally { process.env.TEAMVAULT_AUTH_MODE = 'demo'; }
});
