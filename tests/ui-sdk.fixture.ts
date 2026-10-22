const projects = [
 {id:'p1',title:'Campus Compass',description:'A student-built guide to the places, people, and opportunities that make campus feel like home.',status:'DRAFT'},
 {id:'p2',title:'Second Bloom',description:'Giving everyday items a second life through a campus community exchange.',status:'SUBMITTED'},
 {id:'p3',title:'Quiet Hours',description:'Find your focus with a shared map of calm spaces and thoughtful study routines.',status:'APPROVED'},
 {id:'p4',title:'Open Table',description:'A welcoming place for meaningful conversations, shared meals, and new connections.',status:'CHANGES_REQUESTED'},
].map(p=>({...p,team_id:'alpha',github_url:'https://github.com/',demo_url:'',reviewer_sub:'fixture-reviewer',feedback:p.status==='CHANGES_REQUESTED'?'Please add more detail about your target audience.':'',created_by:'fixture-member',created_at:'2026-10-22T03:00:00Z',updated_at:'2026-10-22T03:00:00Z'}));
const me={sub:'fixture-member',name:'Alex Morgan (fixture)',roles:['member'],team_id:'alpha'};
const secureFetch=async(input:string,options?:RequestInit)=>{
 const path=new URL(input).pathname;
 if(options?.method&&options.method!=='GET')return Response.json({error:'UI fixture is read-only. Use the real app for workflow testing.'},{status:409});
 if(path==='/api/me')return Response.json(me);
 if(path==='/api/submissions')return Response.json({submissions:projects});
 const p=projects.find(p=>path===`/api/submissions/${p.id}`);
 if(p)return Response.json({submission:p,audit:[{id:1,actor_sub:me.sub,action:'CREATED',detail:'Synthetic project created for UI testing.',at:p.created_at}]});
 return Response.json({error:'Not found'},{status:404});
};
export function useTideCloak(){return {secureFetch,token:'ui-fixture-only',logout:async()=>{}};}
