import type { NextRequest } from 'next/server';
import type { Actor, Role } from '../store';
import { withAuth } from './protect';
import { hasRole } from './tideJWT';
import { authMode } from './mode';
import { demoIdentity, sameOrigin } from './demo';

type IdentityHandler = (req: NextRequest, actor: Actor) => Promise<Response>;

export function withIdentity(handler: IdentityHandler) {
  const tideHandler = withAuth(async (req, jwt) => {
    if (typeof jwt.sub !== 'string' || !jwt.sub) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = (['member', 'reviewer', 'admin'] as Role[]).filter(role => hasRole(jwt, role));
    return handler(req, { sub: jwt.sub, roles, name: typeof jwt.name === 'string' && jwt.name.trim() ? jwt.name : `Account ${jwt.sub.slice(0, 8)}` });
  });
  return async (req: NextRequest) => {
    if (authMode() === 'tide') return tideHandler(req);
    const actor = demoIdentity(req);
    if (!actor) return Response.json({ error: 'Sign in to a demo account.' }, { status: 401 });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOrigin(req)) {
      return Response.json({ error: 'Same-origin request required.' }, { status: 403 });
    }
    return handler(req, actor);
  };
}
