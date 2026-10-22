import { withIdentity } from '@/lib/auth/identity';
import { dispatch } from '@/lib/api';
import { getStore } from '@/lib/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = withIdentity((req, actor) => dispatch(req, actor, getStore()));
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
