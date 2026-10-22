import { AppError, type Actor, Store } from './store';

export async function dispatch(req: Request, actor: Actor, store: Store): Promise<Response> {
  try {
    store.register(actor);
    const parts = new URL(req.url).pathname.split('/').filter(Boolean).slice(1);
    const [resource, id, operation] = parts;
    let body: Record<string, unknown> = {};
    if (['POST','PATCH','DELETE'].includes(req.method)) {
      if (Number(req.headers.get('content-length') || 0) > 20000) throw new AppError(413, 'Request is too large.');
      const raw = await req.text();
      if (raw.length > 20000) throw new AppError(413, 'Request is too large.');
      try { body = JSON.parse(raw || '{}'); } catch { throw new AppError(400, 'Invalid JSON.'); }
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new AppError(400, 'Expected a JSON object.');
    }
    let result: unknown;
    if (resource === 'me' && parts.length === 1 && req.method === 'GET') {
      result = { ...actor, team_id: store.team(actor.sub) ?? null };
    } else if (resource === 'submissions' && parts.length === 1) {
      if (req.method === 'GET') result = { submissions: store.list(actor) };
      else if (req.method === 'POST') result = { submission: store.create(actor, body) };
      else throw new AppError(405, 'Method not allowed.');
    } else if (resource === 'submissions' && id && parts.length <= 3) {
      if (parts.length === 2 && req.method === 'GET') result = { submission: store.get(actor, id), audit: store.history(actor, id) };
      else if (parts.length === 2 && req.method === 'PATCH') result = { submission: store.edit(actor, id, body) };
      else if (operation === 'submit' && req.method === 'POST') result = { submission: store.submit(actor, id, body) };
      else if (operation === 'review' && req.method === 'POST') result = { submission: store.review(actor, id, body) };
      else throw new AppError(405, 'Method not allowed.');
    } else if (resource === 'admin' && parts.length === 2) {
      if (id === 'teams' && req.method === 'GET') result = store.adminData(actor);
      else if (id === 'teams' && req.method === 'POST') result = store.manageTeams(actor, body);
      else if (id === 'assignments' && req.method === 'POST') result = { submission: store.assign(actor, body) };
      else throw new AppError(404, 'Endpoint not found.');
    } else throw new AppError(404, 'Endpoint not found.');
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    console.error('TeamVault operation failed:', e instanceof Error ? e.name : 'UnknownError');
    return Response.json({ error: 'Unable to complete this action. Please try again.' }, { status: 500 });
  }
}
