import type { Actor, Store } from '../store';

export const DEMO_ACCOUNTS = [
  { id: 'member-alpha', name: 'Alex Morgan', sub: 'demo-member-alpha', roles: ['member'], team: 'alpha', caption: 'Member · Team Alpha', description: 'Draft and submit projects for Team Alpha.' },
  { id: 'member-beta', name: 'Sam Rivera', sub: 'demo-member-beta', roles: ['member'], team: 'beta', caption: 'Member · Team Beta', description: 'Explore a separate team and its private projects.' },
  { id: 'reviewer', name: 'Jordan Lee', sub: 'demo-reviewer', roles: ['reviewer'], team: null, caption: 'Reviewer', description: 'Review assigned projects and request changes or approve.' },
  { id: 'admin', name: 'Taylor Chen', sub: 'demo-admin', roles: ['admin'], team: null, caption: 'Administrator', description: 'Manage memberships, assign reviewers, and see activity.' },
] satisfies (Actor & { id: string; team: string | null; caption: string; description: string })[];

export function demoActor(account: typeof DEMO_ACCOUNTS[number]): Actor {
  return { sub: account.sub, name: account.name, roles: [...account.roles] };
}

export function seedDemo(store: Store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS demo_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_sessions(token_hash TEXT PRIMARY KEY, subject TEXT NOT NULL, expires_at INTEGER NOT NULL);`);
  store.transaction(() => {
    if (store.db.prepare('SELECT value FROM demo_metadata WHERE key=?').get('seed-version')) return;
    for (const account of DEMO_ACCOUNTS) {
      store.register(demoActor(account));
      if (account.team) store.db.prepare('INSERT INTO memberships(subject,team_id) VALUES (?,?)').run(account.sub, account.team);
    }
    const now = new Date().toISOString();
    const samples = [
      { id: 'demo-campus-compass', team: 'alpha', title: 'Campus Compass', description: 'A welcoming guide to campus spaces, student communities, and the opportunities around the corner.', status: 'DRAFT', reviewer: null },
      { id: 'demo-open-study', team: 'alpha', title: 'Open Study', description: 'Help students find study partners, share their goals, and turn a busy week into a shared plan.', status: 'SUBMITTED', reviewer: 'demo-reviewer' },
      { id: 'demo-second-bloom', team: 'beta', title: 'Second Bloom', description: 'Give everyday items a second life through a thoughtful campus exchange for books, plants, and useful things.', status: 'DRAFT', reviewer: null },
      { id: 'demo-green-loop', team: 'beta', title: 'Green Loop', description: 'A small action tracker that helps student teams build sustainable habits and celebrate collective progress.', status: 'SUBMITTED', reviewer: null },
    ];
    for (const sample of samples) {
      const creator = DEMO_ACCOUNTS.find(a => a.team === sample.team)!;
      store.db.prepare(`INSERT INTO submissions(id,team_id,title,description,github_url,demo_url,status,
        reviewer_sub,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'',?,?,?,?,?)`).run(
        sample.id, sample.team, sample.title, sample.description, 'https://github.com/', sample.status,
        sample.reviewer, creator.sub, now, now);
      store.log(demoActor(DEMO_ACCOUNTS[3]), 'DEMO_SEEDED', 'Illustrative project, preloaded for the simulator. Repository link is a placeholder.', sample.id);
    }
    store.db.prepare('INSERT INTO demo_metadata VALUES (?,?)').run('seed-version', '1');
  });
}
