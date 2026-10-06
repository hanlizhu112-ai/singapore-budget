// Run against a dedicated pilot project before sharing its creation entry.
// The administrator must activate the private setup key first, then remove only
// this script's identified test room and restore the owner's creation key.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createCloudClient,secureToken} from '../src/cloud.mjs';
const contextPath=new URL('../.private-setup/http-context.json',import.meta.url);
const context=JSON.parse(readFileSync(contextPath,'utf8'));
const href='https://hanlizhu112-ai.github.io/singapore-budget/our-spark-test/';
const origin=new URL(href).origin;
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const owner=createCloudClient({config:context.config,href,storage:memory()});
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
await check('browser CORS preflight permits GitHub Pages',async()=>{
 const r=await fetch(context.config.url+'/rest/v1/rpc/our_spark_probe',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'apikey,content-type'},signal:AbortSignal.timeout(15000)});
 assert.ok(r.ok);assert.ok(['*',origin].includes(r.headers.get('access-control-allow-origin')));
 const headers=r.headers.get('access-control-allow-headers')?.toLowerCase();assert.ok(headers?.includes('apikey'));assert.ok(headers?.includes('content-type'));
});
await check('publishable-key-only database health check',async()=>{assert.equal((await owner.probe()).ok,true);});
await check('public clients cannot read private tables',async()=>{
 const r=await fetch(context.config.url+'/rest/v1/rooms?select=*',{headers:{apikey:context.config.publishableKey,'Accept-Profile':'private_spark'},signal:AbortSignal.timeout(15000)});assert.ok([401,403,406].includes(r.status));
});
await owner.importEntry({setup:context.setup});
const created=await owner.api({action:'create',owner:'同步测试甲',partner:'同步测试乙'});
assert.match(created.roomId,/^[a-f0-9-]{36}$/);
context.fixture={roomId:created.roomId,ownerKey:created.resumeKey,partnerKey:created.inviteKey};
writeFileSync(contextPath,JSON.stringify(context),{mode:0o600});
const partner=createCloudClient({config:context.config,href,storage:memory()});
await check('two independent clients hold different server-confirmed roles',async()=>{
 assert.equal(created.role,0);const p=await partner.importEntry({key:created.inviteKey});assert.equal(p.role,1);assert.equal(p.inviteKey,undefined);assert.deepEqual(p.checked,[]);
});
await check('one check-in synchronizes to the other client',async()=>{
 const a=await owner.api({action:'checkin'});assert.equal(a.added,true);assert.deepEqual((await partner.api()).checked,[0]);assert.equal(a.total,0);
});
await check('duplicate owner click is rejected without an extra record',async()=>{assert.equal((await owner.api({action:'checkin'})).added,false);});
await check('both check-ins complete exactly one day on both clients',async()=>{
 const p=await partner.api({action:'checkin'});assert.deepEqual(p.checked,[0,1]);assert.equal(p.total,1);assert.equal(p.streak,1);
 const a=await owner.api();assert.deepEqual(a.checked,[0,1]);assert.equal(a.total,1);assert.equal(a.streak,1);
});
await check('unknown entry tokens cannot read the room',async()=>{
 const stranger=createCloudClient({config:context.config,href,storage:memory()});await assert.rejects(stranger.importEntry({key:created.roomId+'.'+secureToken()}),e=>e.status===401);
});
await check('client-supplied role or date cannot override the stored actor',async()=>{
 const r=await fetch(context.config.url+'/rest/v1/rpc/our_spark_checkin',{method:'POST',headers:{apikey:context.config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_key:created.inviteKey,p_role:0,p_day:'2099-01-01'}),signal:AbortSignal.timeout(15000)});assert.equal(r.status,404);assert.equal((await owner.api()).events.length,2);
});
await check('fresh device resumes its role from its private link',async()=>{
 const fresh=createCloudClient({config:context.config,href,storage:memory()});assert.equal((await fresh.importEntry({key:created.inviteKey})).role,1);assert.equal((await fresh.api()).total,1);
});
await check('export contains both records without entry keys',async()=>{
 const backup=await owner.export();assert.equal(backup.events.length,2);assert.ok(!JSON.stringify(backup).includes(created.resumeKey));assert.ok(!JSON.stringify(backup).includes(created.inviteKey));
});
console.log(JSON.stringify({http_checks_passed:passed,fixture_room_id:created.roomId}));
