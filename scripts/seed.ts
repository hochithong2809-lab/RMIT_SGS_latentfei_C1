import { readFileSync } from 'node:fs';
import { Store, type Actor } from '../src/lib/store';
// Real subject IDs only. This CLI does NOT create Tide users or grant Tide roles.
const file = process.argv[2];
if (!file) throw new Error('Usage: npm run seed -- data/demo-accounts.json (see example in README)');
const accounts = JSON.parse(readFileSync(file,'utf8')) as Record<'memberA'|'memberB'|'reviewer'|'admin',string>;
const ids = Object.values(accounts);
if (ids.length !== 4 || ids.some(s=>typeof s!=='string'||s.length<8||s.includes('REPLACE')) || new Set(ids).size!==4) throw new Error('Provide four distinct real Tide subject IDs.');
const store = new Store(process.env.TEAMVAULT_DB || './data/teamvault.sqlite');
const roles = {memberA:['member'],memberB:['member'],reviewer:['reviewer'],admin:['admin']} as const;
const people = Object.fromEntries(Object.entries(accounts).map(([k,sub]) => [k,{sub,name:`Account ${sub.slice(0,8)}`,roles:[...roles[k as keyof typeof roles]]}])) as Record<keyof typeof accounts,Actor>;
for(const a of Object.values(people))store.register(a);
store.manageTeams(people.admin,{action:'assign',subject:accounts.memberA,team_id:'alpha'});
store.manageTeams(people.admin,{action:'assign',subject:accounts.memberB,team_id:'beta'});
if(store.list(people.admin).length) { console.log('Projects already exist; kept existing submissions.'); }
else {
  store.create(people.memberA,{title:'Campus Compass',description:'A student-built guide to the places, people, and opportunities that make campus feel like home.',github_url:'https://github.com/',demo_url:''});
  const s=store.create(people.memberB,{title:'Second Bloom',description:'A community exchange that gives everyday items a second life and makes sustainable choices easier.',github_url:'https://github.com/',demo_url:''});
  store.submit(people.memberB,s.id,{});store.assign(people.admin,{submission_id:s.id,reviewer_sub:accounts.reviewer});
  console.log('Synthetic project content seeded against real subject IDs. Replace sample repository links before presenting.');
}
store.close();
