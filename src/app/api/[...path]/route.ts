import { withAuth } from '@/lib/auth/protect';
import { hasRole } from '@/lib/auth/tideJWT';
import { dispatch } from '@/lib/api';
import { getStore, type Role } from '@/lib/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = withAuth(async (req, jwt) => {
  if (typeof jwt.sub !== 'string' || !jwt.sub) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const roles = (['member','reviewer','admin'] as Role[]).filter(r => hasRole(jwt, r));
  return dispatch(req, { sub: jwt.sub, roles, name: typeof jwt.name === 'string' && jwt.name.trim() ? jwt.name : `Account ${jwt.sub.slice(0,8)}` }, getStore());
});
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
