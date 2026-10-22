import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
if (existsSync('data/tidecloak.json')) {
  try {
    const adapter=JSON.parse(readFileSync('data/tidecloak.json','utf8'));
    if(adapter.jwk?.keys?.length && adapter.realm && adapter.resource){
      console.log('A real adapter has already been exported. Bootstrap skipped to preserve the realm. Run npm run dev, then test login.');
      process.exit(0);
    }
  } catch { /* Continue with checked bootstrap; do not accept an invalid adapter. */ }
}
if(!existsSync('.env')) { console.error('Copy .env.example to .env and fill the password, licence email and your terms answer.'); process.exit(2); }
const run = args => { const r=spawnSync('docker',args,{stdio:'inherit'}); if(r.status!==0) process.exit(r.status||1); };
run(['compose','up','-d','tidecloak']);
run(['compose','--profile','setup','run','--rm','--build','bootstrap']);
