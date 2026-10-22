import {build} from 'esbuild';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
const dir=resolve('test-results/ui');mkdirSync(dir,{recursive:true});
await build({entryPoints:['tests/ui-fixture.tsx'],bundle:true,jsx:'automatic',outfile:join(dir,'fixture.js'),alias:{'@tidecloak/nextjs':resolve('tests/ui-sdk.fixture.ts')},define:{'process.env.NODE_ENV':'"production"'}});
writeFileSync(join(dir,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TeamVault — isolated UI fixture</title><link rel="stylesheet" href="/fixture.css"><style>.fixture-banner{padding:7px;background:#fbeac1;text-align:center;font:10px Arial;letter-spacing:1px;position:fixed;bottom:0;left:0;right:0;z-index:100;pointer-events:none}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
createServer((req,res)=>{const file={'/':'index.html','/fixture.js':'fixture.js','/fixture.css':'fixture.css'}[req.url];if(!file){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync(join(dir,file)));}).listen(3100,'127.0.0.1',()=>console.log('Read-only UI fixture: http://localhost:3100 (no Tide login / no real API).'));
