import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Role = 'member' | 'reviewer' | 'admin';
export type Actor = { sub: string; name: string; roles: Role[] };
export type Status = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED';
export type Submission = { id: string; team_id: string; title: string; description: string;
  github_url: string; demo_url: string; status: Status; reviewer_sub: string | null;
  feedback: string; created_by: string; created_at: string; updated_at: string };
type Body = Record<string, unknown>;
export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function requireRole(actor: Actor, role: Role) {
  if (!actor.roles.includes(role)) throw new AppError(403, 'Your account does not have permission for this action.');
}
function text(value: unknown, name: string, max: number, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new AppError(400, `${name} must contain 1–${max} characters.`);
  return value.trim();
}
function url(value: unknown, name: string, optional = false) {
  const s = text(value, name, 2000, optional);
  if (!s) return '';
  try { const parsed = new URL(s); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw Error(); }
  catch { throw new AppError(400, `${name} must be an http or https URL without credentials.`); }
  return s;
}
function fields(body: Body, allowed: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k)))
    throw new AppError(400, 'Unexpected request fields.');
}
function project(body: Body) {
  fields(body, ['title', 'description', 'github_url', 'demo_url']);
  return { title: text(body.title, 'Title', 120), description: text(body.description, 'Description', 6000),
    github_url: url(body.github_url, 'GitHub link'), demo_url: url(body.demo_url, 'Demo link', true) };
}

export class Store {
  db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS users(sub TEXT PRIMARY KEY, name TEXT NOT NULL, roles TEXT NOT NULL, last_seen TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS memberships(subject TEXT PRIMARY KEY REFERENCES users(sub), team_id TEXT NOT NULL REFERENCES teams(id));
      CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id),
        title TEXT NOT NULL, description TEXT NOT NULL, github_url TEXT NOT NULL, demo_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','CHANGES_REQUESTED')),
        reviewer_sub TEXT REFERENCES users(sub), feedback TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(sub),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id TEXT REFERENCES submissions(id),
        actor_sub TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dpop_jtis(jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS submission_team ON submissions(team_id);
      CREATE INDEX IF NOT EXISTS submission_reviewer ON submissions(reviewer_sub);`);
    this.db.prepare('INSERT OR IGNORE INTO teams(id,name) VALUES (?,?)').run('alpha', 'Team Alpha');
    this.db.prepare('INSERT OR IGNORE INTO teams(id,name) VALUES (?,?)').run('beta', 'Team Beta');
  }
  close() { this.db.close(); }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  register(actor: Actor) {
    this.db.prepare(`INSERT INTO users VALUES (?,?,?,?) ON CONFLICT(sub) DO UPDATE SET
      name=excluded.name, roles=excluded.roles, last_seen=excluded.last_seen`).run(
      actor.sub, actor.name, JSON.stringify(actor.roles), new Date().toISOString());
  }
  team(subject: string): string | undefined {
    return (this.db.prepare('SELECT team_id FROM memberships WHERE subject=?').get(subject) as { team_id: string } | undefined)?.team_id;
  }
  log(actor: Actor, action: string, detail: string, submission: string | null = null) {
    this.db.prepare('INSERT INTO audit(submission_id,actor_sub,action,detail,at) VALUES(?,?,?,?,?)')
      .run(submission, actor.sub, action, detail, new Date().toISOString());
  }
  ownTeam(actor: Actor) {
    requireRole(actor, 'member'); const team = this.team(actor.sub);
    if (!team) throw new AppError(403, 'Ask an administrator to add your account to a team.');
    return team;
  }
  visible(actor: Actor, s: Submission) {
    return actor.roles.includes('admin') ||
      (actor.roles.includes('member') && this.team(actor.sub) === s.team_id) ||
      (actor.roles.includes('reviewer') && s.reviewer_sub === actor.sub && s.status !== 'DRAFT');
  }
  get(actor: Actor, id: string): Submission {
    const s = this.db.prepare('SELECT * FROM submissions WHERE id=?').get(id) as Submission | undefined;
    if (!s || !this.visible(actor, s)) throw new AppError(404, 'Submission not found.');
    return s;
  }
  list(actor: Actor) {
    return (this.db.prepare('SELECT * FROM submissions ORDER BY updated_at DESC').all() as Submission[]).filter(s => this.visible(actor, s));
  }
  history(actor: Actor, id: string) {
    this.get(actor, id);
    return this.db.prepare('SELECT * FROM audit WHERE submission_id=? ORDER BY id DESC').all(id);
  }
  create(actor: Actor, body: Body) {
    const team = this.ownTeam(actor), p = project(body), id = randomUUID(), now = new Date().toISOString();
    return this.transaction(() => {
      this.db.prepare(`INSERT INTO submissions(id,team_id,title,description,github_url,demo_url,status,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'DRAFT',?,?,?)`).run(id, team, p.title, p.description, p.github_url, p.demo_url, actor.sub, now, now);
      this.log(actor, 'CREATED', 'Draft created.', id); return this.get(actor, id);
    });
  }
  edit(actor: Actor, id: string, body: Body) {
    const p = project(body);
    return this.transaction(() => {
      const s = this.get(actor, id);
      if (this.ownTeam(actor) !== s.team_id) throw new AppError(404, 'Submission not found.');
      if (!['DRAFT','CHANGES_REQUESTED'].includes(s.status)) throw new AppError(409, 'This submission is locked for editing.');
      this.db.prepare(`UPDATE submissions SET title=?,description=?,github_url=?,demo_url=?,updated_at=? WHERE id=?`)
        .run(p.title, p.description, p.github_url, p.demo_url, new Date().toISOString(), id);
      this.log(actor, 'EDITED', 'Project details updated.', id); return this.get(actor, id);
    });
  }
  submit(actor: Actor, id: string, body: Body) {
    fields(body, []);
    return this.transaction(() => {
      const s = this.get(actor, id);
      if (this.ownTeam(actor) !== s.team_id) throw new AppError(404, 'Submission not found.');
      if (!['DRAFT','CHANGES_REQUESTED'].includes(s.status)) throw new AppError(409, 'This submission cannot be submitted again now.');
      this.db.prepare("UPDATE submissions SET status='SUBMITTED',updated_at=? WHERE id=?").run(new Date().toISOString(), id);
      this.log(actor, 'SUBMITTED', 'Submitted for review.', id); return this.get(actor, id);
    });
  }
  review(actor: Actor, id: string, body: Body) {
    requireRole(actor, 'reviewer'); fields(body, ['decision','feedback']);
    if (!['APPROVED','CHANGES_REQUESTED'].includes(String(body.decision))) throw new AppError(400, 'Invalid review decision.');
    const feedback = text(body.feedback, 'Feedback', 3000);
    return this.transaction(() => {
      const s = this.get(actor, id);
      if (s.reviewer_sub !== actor.sub) throw new AppError(404, 'Submission not found.');
      if (this.team(actor.sub) === s.team_id || s.created_by === actor.sub) throw new AppError(403, 'You cannot review your own team or project.');
      if (s.status !== 'SUBMITTED') throw new AppError(409, 'This submission is not awaiting review.');
      this.db.prepare('UPDATE submissions SET status=?,feedback=?,updated_at=? WHERE id=?')
        .run(String(body.decision), feedback, new Date().toISOString(), id);
      this.log(actor, String(body.decision), feedback, id); return this.get(actor, id);
    });
  }
  adminData(actor: Actor) {
    requireRole(actor, 'admin');
    return { teams: this.db.prepare('SELECT * FROM teams ORDER BY name').all(),
      users: this.db.prepare('SELECT * FROM users ORDER BY name').all().map(u => ({ ...u, roles: JSON.parse(u.roles as string) })),
      memberships: this.db.prepare('SELECT * FROM memberships').all(),
      audit: this.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all() };
  }
  manageTeams(actor: Actor, body: Body) {
    requireRole(actor, 'admin'); fields(body, ['action','name','subject','team_id']);
    return this.transaction(() => {
      if (body.action === 'create') {
        const name = text(body.name, 'Team name', 100);
        if (this.db.prepare('SELECT id FROM teams WHERE name=?').get(name)) throw new AppError(409, 'A team with this name exists.');
        this.db.prepare('INSERT INTO teams VALUES (?,?)').run(randomUUID(), name);
        this.log(actor, 'TEAM_CREATED', name);
      } else if (body.action === 'assign' || body.action === 'remove') {
        const subject = text(body.subject, 'Subject', 200);
        const user = this.db.prepare('SELECT roles FROM users WHERE sub=?').get(subject);
        if (!user) throw new AppError(400, 'The account must sign in once before assignment.');
        if (body.action === 'assign') {
          const team = text(body.team_id, 'Team', 200);
          if (!this.db.prepare('SELECT id FROM teams WHERE id=?').get(team)) throw new AppError(400, 'Unknown team.');
          if (!(JSON.parse(user.roles as string) as string[]).includes('member')) throw new AppError(400, 'Assign the member role in TideCloak, then ask this account to sign in again.');
          this.db.prepare('INSERT INTO memberships VALUES (?,?) ON CONFLICT(subject) DO UPDATE SET team_id=excluded.team_id').run(subject, team);
          this.log(actor, 'MEMBERSHIP_ASSIGNED', `${subject} → ${team}`);
        } else {
          this.db.prepare('DELETE FROM memberships WHERE subject=?').run(subject);
          this.log(actor, 'MEMBERSHIP_REMOVED', subject);
        }
      } else throw new AppError(400, 'Unknown team action.');
      return this.adminData(actor);
    });
  }
  assign(actor: Actor, body: Body) {
    requireRole(actor, 'admin'); fields(body, ['submission_id','reviewer_sub']);
    const id = text(body.submission_id, 'Submission', 200), reviewer = text(body.reviewer_sub, 'Reviewer', 200);
    return this.transaction(() => {
      const s = this.get(actor, id);
      if (s.status !== 'SUBMITTED') throw new AppError(409, 'Only submitted projects can be assigned.');
      const u = this.db.prepare('SELECT roles FROM users WHERE sub=?').get(reviewer);
      if (!u || !(JSON.parse(u.roles as string) as string[]).includes('reviewer')) throw new AppError(400, 'Reviewer must sign in with the reviewer role first.');
      if (this.team(reviewer) === s.team_id || s.created_by === reviewer) throw new AppError(403, 'A team member or project creator cannot review this project.');
      this.db.prepare('UPDATE submissions SET reviewer_sub=?,updated_at=? WHERE id=?').run(reviewer, new Date().toISOString(), id);
      this.log(actor, 'REVIEWER_ASSIGNED', reviewer, id); return this.get(actor, id);
    });
  }
  claimJti(jti: string, expiresAtMs: number) {
    return this.transaction(() => {
      this.db.prepare('DELETE FROM dpop_jtis WHERE expires_at < ?').run(Date.now());
      const r = this.db.prepare('INSERT OR IGNORE INTO dpop_jtis VALUES (?,?)').run(jti, expiresAtMs);
      return Number(r.changes) === 1;
    });
  }
}

let singleton: Store | undefined;
export function getStore() { return singleton ??= new Store(process.env.TEAMVAULT_DB || './data/teamvault.sqlite'); }
