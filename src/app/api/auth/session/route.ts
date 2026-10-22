import { demoSession } from '@/lib/auth/demo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = (req: Request) => demoSession(req);
export { handle as GET, handle as POST, handle as DELETE };
