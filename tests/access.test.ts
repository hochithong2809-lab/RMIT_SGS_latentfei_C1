import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { Store, AppError, type Actor } from '../src/lib/store';
import { dispatch } from '../src/lib/api';
const a:Actor={sub:'member-a',name:'Synthetic A',roles:['member']};
const b:Actor={sub:'member-b',name:'Synthetic B',roles:['member']};
const reviewer:Actor={sub:'reviewer-one',name:'Synthetic Reviewer',roles:['reviewer']};
const other:Actor={sub:'reviewer-other',name:'Other Reviewer',roles:['reviewer']};
const admin:Actor={sub:'admin-one',name:'Synthetic Admin',roles:['admin']};
const content={title:'Example project',description:'Synthetic test project',github_url:'https://github.com/example/project',demo_url:''};
function setup(file=':memory:') {
 const s=new Store(file);for(const p of [a,b,reviewer,other,admin])s.register(p);
 s.manageTeams(admin,{action:'assign',subject:a.sub,team_id:'alpha'});
 s.manageTeams(admin,{action:'assign',subject:b.sub,team_id:'beta'});return s;
}
const status=(n:number)=>(e:unknown)=>e instanceof AppError&&e.status===n;
test('members can only list/read/edit their own team projects',()=>{
 const s=setup();const p=s.create(a,content);
 assert.equal(s.list(b).length,0);assert.throws(()=>s.get(b,p.id),status(404));assert.throws(()=>s.edit(b,p.id,content),status(404));
 assert.equal(s.get(a,p.id).id,p.id);s.close();
});
test('no role/no membership cannot create; admin cannot implicitly review',()=>{
 const s=setup();assert.throws(()=>s.create({...a,roles:[]},content),status(403));
 assert.throws(()=>s.create({...a,sub:'unassigned'},content),status(403));
 const p=s.create(a,content);s.submit(a,p.id,{});assert.throws(()=>s.review(admin,p.id,{decision:'APPROVED',feedback:'Fine'}),status(403));s.close();
});
test('only assigned reviewers can read/review; drafts stay private from reviewers',()=>{
 const s=setup();const p=s.create(a,content);assert.throws(()=>s.get(reviewer,p.id),status(404));
 s.submit(a,p.id,{});s.assign(admin,{submission_id:p.id,reviewer_sub:reviewer.sub});
 assert.equal(s.list(reviewer).length,1);assert.equal(s.list(other).length,0);
 assert.throws(()=>s.review(other,p.id,{decision:'APPROVED',feedback:'Good'}),status(404));s.close();
});
test('self review denied even with member/reviewer/admin combined roles',()=>{
 const s=setup();const hybrid:Actor={...a,roles:['member','reviewer','admin']};s.register(hybrid);
 const p=s.create(hybrid,content);s.submit(hybrid,p.id,{});
 assert.throws(()=>s.assign(admin,{submission_id:p.id,reviewer_sub:a.sub}),status(403));
 s.db.prepare('UPDATE submissions SET reviewer_sub=? WHERE id=?').run(a.sub,p.id);
 assert.throws(()=>s.review(hybrid,p.id,{decision:'APPROVED',feedback:'Me'}),status(403));s.close();
});
test('submitted/approved projects cannot be edited and double decisions are rejected',()=>{
 const s=setup();const p=s.create(a,content);s.submit(a,p.id,{});assert.throws(()=>s.edit(a,p.id,content),status(409));
 s.assign(admin,{submission_id:p.id,reviewer_sub:reviewer.sub});s.review(reviewer,p.id,{decision:'APPROVED',feedback:'Ready'});
 assert.throws(()=>s.edit(a,p.id,content),status(409));assert.throws(()=>s.submit(a,p.id,{}),status(409));
 assert.throws(()=>s.review(reviewer,p.id,{decision:'CHANGES_REQUESTED',feedback:'Again'}),status(409));
 assert.equal(s.history(a,p.id).filter(e=>e.action==='APPROVED').length,1);s.close();
});
test('request changes → edit → resubmit → approve preserves audit history',()=>{
 const s=setup();const p=s.create(a,content);s.submit(a,p.id,{});s.assign(admin,{submission_id:p.id,reviewer_sub:reviewer.sub});
 s.review(reviewer,p.id,{decision:'CHANGES_REQUESTED',feedback:'Add detail'});
 s.edit(a,p.id,{...content,description:'New detail'});s.submit(a,p.id,{});
 s.review(reviewer,p.id,{decision:'APPROVED',feedback:'Ready now'});
 assert.equal(s.get(a,p.id).status,'APPROVED');assert.deepEqual(s.history(a,p.id).map(e=>e.action).reverse(),
 ['CREATED','SUBMITTED','REVIEWER_ASSIGNED','CHANGES_REQUESTED','EDITED','SUBMITTED','APPROVED']);s.close();
});
test('payload cannot change identity, role, team, status or reviewer',()=>{
 const s=setup();for(const field of ['userId','role','team_id','status','reviewer_sub'])assert.throws(()=>s.create(a,{...content,[field]:'admin'}),status(400));
 assert.throws(()=>s.create(a,{...content,github_url:'javascript:alert(1)'}),status(400));
 assert.throws(()=>s.create(a,{...content,demo_url:'https://user:pass@example.org'}),status(400));s.close();
});
test('admin membership changes are immediate and unknown users cannot be assigned',()=>{
 const s=setup();const p=s.create(a,content);
 assert.throws(()=>s.manageTeams(a,{action:'create',name:'Bad'}),status(403));
 assert.throws(()=>s.manageTeams(admin,{action:'assign',subject:'missing',team_id:'alpha'}),status(400));
 s.manageTeams(admin,{action:'remove',subject:a.sub});assert.throws(()=>s.get(a,p.id),status(404));s.close();
});
test('API returns correct errors for direct unauthorized operations',async()=>{
 const s=setup();const p=s.create(a,content);
 const req=(path:string,method='GET',body?:unknown)=>new Request('http://localhost:3000/api/'+path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.equal((await dispatch(req('admin/teams'),a,s)).status,403);
 assert.equal((await dispatch(req('submissions/'+p.id),b,s)).status,404);
 assert.equal((await dispatch(req('submissions','POST',{...content,role:'admin'}),a,s)).status,400);
 assert.equal((await dispatch(new Request('http://localhost/api/submissions',{method:'POST',body:'{'}),a,s)).status,400);
 assert.equal((await dispatch(req('submissions/'+p.id),a,s)).status,200);s.close();
});
function persistent(){mkdirSync('test-results',{recursive:true});return join(mkdtempSync(join(process.cwd(),'test-results/db-')),'store.sqlite');}
test('SQLite state and audit survive a new process',()=>{
 const file=persistent();const s=setup(file);const p=s.create(a,content);s.close();
 const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {Store} from './src/lib/store.ts';const s=new Store(process.env.CHECK_DB);console.log(s.db.prepare('SELECT count(*) AS n FROM submissions').get().n);console.log(s.db.prepare('SELECT count(*) AS n FROM audit WHERE submission_id IS NOT NULL').get().n);s.close();`],{env:{...process.env,CHECK_DB:file},encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),'1\n1');
 const again=new Store(file);assert.equal(again.get(a,p.id).status,'DRAFT');again.close();
});
test('DPoP replay records are shared across independent database connections',()=>{
 const file=persistent(),one=new Store(file),two=new Store(file);
 assert.equal(one.claimJti('same-proof',Date.now()+60000),true);
 assert.equal(two.claimJti('same-proof',Date.now()+60000),false);one.close();two.close();
});
test('two separate processes cannot both apply a review decision',async()=>{
 const file=persistent(),s=setup(file),p=s.create(a,content);s.submit(a,p.id,{});s.assign(admin,{submission_id:p.id,reviewer_sub:reviewer.sub});s.close();
 const worker=`import {Store} from './src/lib/store.ts';const s=new Store(process.env.CHECK_DB);try{s.review(JSON.parse(process.env.ACTOR),process.env.PROJECT,{decision:'APPROVED',feedback:'Concurrent review'});console.log('200')}catch(e){console.log(e.status)}s.close();`;
 const run=()=>new Promise<string>((resolve,reject)=>{let out='',err='';const c=spawn(process.execPath,['--import','tsx','--input-type=module','-e',worker],{env:{...process.env,CHECK_DB:file,ACTOR:JSON.stringify(reviewer),PROJECT:p.id}});c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('exit',code=>code===0?resolve(out.trim()):reject(Error(`worker failed: ${err}`)))});
 assert.deepEqual((await Promise.all([run(),run()])).sort(),['200','409']);
 const after=new Store(file);assert.equal(after.history(a,p.id).filter(e=>e.action==='APPROVED').length,1);after.close();
});
