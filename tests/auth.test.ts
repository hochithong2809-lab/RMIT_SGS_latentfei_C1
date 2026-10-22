import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint } from 'jose';
import { createHash, randomUUID } from 'node:crypto';
import { verifyDpop, MemoryJtiStore } from '../src/lib/auth/verifyDpop';
import { Store } from '../src/lib/store';
const realm=await generateKeyPair('ES256',{extractable:true}),jwk=await exportJWK(realm.publicKey);
process.env.CLIENT_ADAPTER=JSON.stringify({realm:'unit-test',resource:'teamvault-client','auth-server-url':'http://localhost:8080',jwk:{keys:[{...jwk,kid:'unit-key',alg:'ES256'}]}});
const {verifyTideJWT,hasRole}=await import('../src/lib/auth/tideJWT');
async function token(changes:Record<string,unknown>={}){
 const now=Math.floor(Date.now()/1000);
 return new SignJWT({sub:'synthetic-test-user',iss:'http://localhost:8080/realms/unit-test',azp:'teamvault-client',iat:now,exp:now+300,realm_access:{roles:['member']},...changes}).setProtectedHeader({alg:'ES256',kid:'unit-key'}).sign(realm.privateKey);
}
test('locally signed valid test token passes real verifier; role checks use the correct client',async()=>{
 const claims=await verifyTideJWT(await token({resource_access:{another_client:{roles:['admin']}}}));
 assert.equal(claims.sub,'synthetic-test-user');assert.equal(hasRole(claims,'member'),true);assert.equal(hasRole(claims,'admin'),false);
});
test('expired, wrong issuer, wrong client, missing expiry and future-issued tokens are rejected',async()=>{
 const now=Math.floor(Date.now()/1000);
 for(const changes of [{exp:now-100},{iss:'https://wrong.example/realms/x'},{azp:'wrong-app'},{exp:undefined},{iat:now+3600}])await assert.rejects(()=>token(changes).then(verifyTideJWT));
 await assert.rejects(()=>verifyTideJWT('not-a-token'));
 const raw=await token();const parts=raw.split('.');parts[1]=Buffer.from(JSON.stringify({sub:'admin'})).toString('base64url');await assert.rejects(()=>verifyTideJWT(parts.join('.')));
});
const proofKey=await generateKeyPair('ES256',{extractable:true}),pub=await exportJWK(proofKey.publicKey);
const claims={cnf:{jkt:await calculateJwkThumbprint(pub)}};
const access='synthetic-token-for-proof-unit-tests';
async function request(overrides:Record<string,unknown>={},headers:Record<string,string>={}){
 const proof=await new SignJWT({jti:randomUUID(),htm:'GET',htu:'http://localhost:3000/api/me',iat:Math.floor(Date.now()/1000),ath:createHash('sha256').update(access).digest('base64url'),...overrides}).setProtectedHeader({alg:'ES256',typ:'dpop+jwt',jwk:pub}).sign(proofKey.privateKey);
 return new Request('http://localhost:3000/api/me',{headers:{Authorization:`DPoP ${access}`,DPoP:proof,...headers}});
}
test('DPoP valid request accepted once; replay rejected',async()=>{
 const r=await request(),store=new MemoryJtiStore();await verifyDpop(r,access,claims,{jtiStore:store,trustForwardedHeaders:false});await assert.rejects(()=>verifyDpop(r,access,claims,{jtiStore:store}));
});
test('DPoP rejects Bearer replay, missing proof, wrong URL/method/key/token and stale proof',async()=>{
 await assert.rejects(()=>verifyDpop(awaitRequest(),access,claims));
 function awaitRequest(){return new Request('http://localhost:3000/api/me',{headers:{Authorization:`DPoP ${access}`}})}
 const cases: [Record<string,unknown>,Record<string,string>][]=[
  [{},{Authorization:`Bearer ${access}`}],[{htm:'POST'},{}],[{htu:'http://localhost:3000/api/admin/teams'},{}],
  [{ath:'wrong'},{}],[{iat:1},{}]
 ];
 for(const [p,h]of cases){const r=await request(p,h);await assert.rejects(()=>verifyDpop(r,access,claims));}
 const r=await request();await assert.rejects(()=>verifyDpop(r,access,{cnf:{jkt:'wrong-key'}}));await assert.rejects(()=>verifyDpop(r,access,{}));
});
test('JTI storage rejects repeated proof identifiers',()=>{
 const s=new Store(':memory:');assert.equal(s.claimJti('one',Date.now()+60000),true);assert.equal(s.claimJti('one',Date.now()+60000),false);s.close();
});
