// Isolated rendering fixture. Bundled ONLY by scripts/ui-fixture.mjs into ignored
// test-results; never imported by Next.js or used as an authentication fallback.
import { createRoot } from 'react-dom/client';
import Workspace from '../src/components/workspace';
import '../src/app/globals.css';
createRoot(document.getElementById('root')!).render(<><div className="fixture-banner">UI TEST FIXTURE · SYNTHETIC DATA · NOT A LIVE TIDE LOGIN</div><Workspace/></>);
