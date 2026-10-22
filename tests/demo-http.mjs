// Production HTTP integration in an isolated demo database; never contacts a Tide realm.
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

if (!existsSync('.next/BUILD_ID')) throw new Error('Run npm run build first.');
mkdirSync('test-results', { recursive: true });
const directory = mkdtempSync(resolve('test-results/demo-http-'));
const probe = createServer();
await new Promise((ready, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', ready); });
const port = probe.address().port;
await new Promise(ready => probe.close(ready));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, TEAMVAULT_AUTH_MODE: 'demo', TEAMVAULT_DEMO_DB: join(directory, 'demo.sqlite') };
let child, logs = '';
async function start() {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`Test server exited: ${logs}`);
    try { const response = await fetch(base + '/api/config'); if (response.ok) return; } catch { /* Wait until listener is ready. */ }
    await delay(200);
  }
  throw new Error('Test server not ready: ' + logs);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise(ready => child.once('exit', ready)); child.kill(); await ended;
}
async function call(path, method = 'GET', body, cookie) {
  return fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function login(accountId) {
  const response = await call('/api/auth/session', 'POST', { accountId });
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers.get('set-cookie').split(';')[0];
}
try {
  await start();
  assert.equal((await (await call('/api/config')).json()).authMode, 'demo');
  assert.equal((await call('/api/me')).status, 401);
  const a = await login('member-alpha'), b = await login('member-beta'), r = await login('reviewer'), admin = await login('admin');
  console.log('PASS HTTP: demo configuration, four sign-ins and anonymous 401');
  const content = { title: 'HTTP workflow check', description: 'Isolated production-server test data.', github_url: 'https://github.com/', demo_url: '' };
  const created = await call('/api/submissions', 'POST', content, a);
  assert.equal(created.status, 200, await created.clone().text());
  const id = (await created.json()).submission.id, path = '/api/submissions/' + id;
  assert.equal((await call(path, 'GET', undefined, b)).status, 404);
  assert.equal((await call('/api/admin/teams', 'GET', undefined, a)).status, 403);
  assert.equal((await call('/api/submissions', 'POST', { ...content, role: 'admin' }, a)).status, 400);
  assert.equal((await call(path, 'GET', undefined, r)).status, 404);
  console.log('PASS HTTP: cross-team isolation, direct admin denial, payload tampering and draft privacy');
  assert.equal((await call(path + '/submit', 'POST', {}, a)).status, 200);
  assert.equal((await call(path, 'PATCH', content, a)).status, 409);
  assert.equal((await call(path + '/review', 'POST', { decision: 'APPROVED', feedback: 'No implicit review role.' }, admin)).status, 403);
  assert.equal((await call('/api/admin/assignments', 'POST', { submission_id: id, reviewer_sub: 'demo-reviewer' }, admin)).status, 200);
  assert.equal((await call(path + '/review', 'POST', { decision: 'CHANGES_REQUESTED', feedback: 'Add another detail.' }, r)).status, 200);
  assert.equal((await call(path, 'PATCH', { ...content, description: 'Updated with requested detail.' }, a)).status, 200);
  assert.equal((await call(path + '/submit', 'POST', {}, a)).status, 200);
  const decisions = await Promise.all([1, 2].map(() => call(path + '/review', 'POST', { decision: 'APPROVED', feedback: 'Ready to share.' }, r)));
  assert.deepEqual(decisions.map(response => response.status).sort(), [200, 409]);
  assert.equal((await call(path, 'PATCH', content, a)).status, 409);
  console.log('PASS HTTP: submit → admin assignment → request changes → edit/resubmit → concurrent approval');
  assert.equal((await call('/api/auth/session', 'DELETE', undefined, r)).status, 200);
  assert.equal((await call('/api/me', 'GET', undefined, r)).status, 401);
  await stop(); await start();
  const restored = await call(path, 'GET', undefined, a);
  assert.equal(restored.status, 200);
  const data = await restored.json();
  assert.equal(data.submission.status, 'APPROVED');
  assert.equal(data.audit.filter(entry => entry.action === 'APPROVED').length, 1);
  console.log('PASS HTTP: logout revocation and project/session/audit persistence across server restart');
  console.log('Production HTTP checks passed using an isolated SQLite database. No live Tide login claimed.');
} finally { await stop(); }
