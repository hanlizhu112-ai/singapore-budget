import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {reservePrankPlayback,rememberPrankPlayback,isFireVisible} from '../src/pranks.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const base=read('../supabase/setup.sql'),capsules=read('../supabase/capsules.sql'),extension=read('../supabase/pranks.sql');
const token=()=>randomBytes(32).toString('hex');
async function rpc(db,name,args){await db.exec('set role anon');try{return (await db.query(`select public.our_spark_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v;}finally{await db.exec('reset role');}}
test('pranks trigger on the other participant’s next new checkin and preserve all existing data',async t=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon nologin;create role authenticated nologin;');await db.exec(base);await db.exec(capsules);
  const setup=token(),owner=token(),partner=token();await db.query('update private_spark.settings set setup_hash=private_spark.token_hash($1)',[setup]);
  const room=await rpc(db,'create',[setup,'测试甲','测试乙',owner,partner]);
  await db.query('insert into private_spark.checkins(room_id,day,role) select $1::uuid,private_spark.day_key(now())-d,r from generate_series(1,36)d cross join generate_series(0,1)r',[room.roomId]);
  await rpc(db,'seal_capsule',[room.resumeKey,60,'保留原有封存内容']);
  const before=await rpc(db,'export',[room.resumeKey]);const bodyBefore=(await db.query('select message from private_spark.capsules')).rows[0].message;
  await db.exec(extension);await db.exec(extension);
  await t.test('repeated installation retains checkins, letters, role keys and original counting helpers',async()=>{
   const after=await rpc(db,'export',[room.resumeKey]);delete before.exportedAt;delete after.exportedAt;assert.deepEqual(after,before);
   assert.equal((await rpc(db,'state',[room.inviteKey])).streak,36);assert.equal((await db.query('select message from private_spark.capsules')).rows[0].message,bodyBefore);
  });
  let prankId;
  await t.test('one pending choice per author can be replaced without stacking or spoiling it to the recipient',async()=>{
   let armed=await rpc(db,'set_prank',[room.resumeKey,'popcorn']);prankId=armed.pendingPrank.id;
   armed=await rpc(db,'set_prank',[room.resumeKey,'gust']);assert.equal(armed.pendingPrank.id,prankId);assert.equal(armed.pendingPrank.kind,'gust');
   const other=await rpc(db,'state',[room.inviteKey]);assert.equal(other.pendingPrank,null);assert.equal(other.prank,null);
   assert.equal((await db.query('select count(*) from private_spark.pranks')).rows[0].count,1);
  });
  await t.test('refreshing or the author checking in does not trigger the author’s outgoing prank',async()=>{
   assert.equal((await rpc(db,'state',[room.inviteKey])).prank,null);
   const author=await rpc(db,'checkin',[room.resumeKey]);assert.equal(author.added,true);assert.equal(author.prank,null);assert.ok(author.pendingPrank);
   assert.equal((await db.query('select count(*) from private_spark.pranks where triggered_at is not null')).rows[0].count,0);
  });
  await t.test('recipient’s successful checkin triggers one receipt and keeps the completed-day count correct',async()=>{
   const received=await rpc(db,'checkin',[room.inviteKey]);assert.equal(received.added,true);assert.equal(received.streak,37);assert.equal(received.total,37);
   assert.deepEqual(received.prank,{id:prankId,kind:'gust'});assert.equal((await rpc(db,'state',[room.resumeKey])).pendingPrank,null);
  });
  await t.test('lost responses can recover the same receipt; duplicate checkins do not consume the next queued prank',async()=>{
   const next=await rpc(db,'set_prank',[room.resumeKey,'sneeze']);assert.notEqual(next.pendingPrank.id,prankId);
   const retry=await rpc(db,'checkin',[room.inviteKey]);assert.equal(retry.added,false);assert.equal(retry.prank.id,prankId);
   assert.equal((await rpc(db,'state',[room.inviteKey])).prank.id,prankId);
   const rows=await db.query('select count(*) filter(where triggered_at is not null) as fired,count(*) filter(where triggered_at is null) as waiting from private_spark.pranks');assert.deepEqual(rows.rows[0],{fired:1,waiting:1});
   assert.equal((await db.query('select count(*) from private_spark.checkins')).rows[0].count,74);
  });
  await t.test('only the actual recipient can acknowledge; after acknowledgement refresh has no effect to replay',async()=>{
   await assert.rejects(rpc(db,'ack_prank',[room.resumeKey,prankId]),e=>e.code==='PT403');
   assert.equal((await rpc(db,'ack_prank',[room.inviteKey,prankId])).ok,true);assert.equal((await rpc(db,'ack_prank',[room.inviteKey,prankId])).ok,true);
   assert.equal((await rpc(db,'state',[room.inviteKey])).prank,null);
  });
  await t.test('forged keys, bad kinds and direct table reads are rejected',async()=>{
   for(const kind of ['unknown',null])await assert.rejects(rpc(db,'set_prank',[room.resumeKey,kind]),e=>e.code==='PT400');
   await assert.rejects(rpc(db,'set_prank',[room.roomId+'.'+token(),'popcorn']),e=>e.code==='PT401');
   await assert.rejects(rpc(db,'set_prank',[room.resumeKey,'popcorn',1]),e=>e.code==='42883');
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(db.exec('select * from private_spark.pranks'),e=>e.code==='42501');}finally{await db.exec('reset role');}}
   const rows=await db.query("select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('our_spark_state','our_spark_checkin','our_spark_set_prank','our_spark_ack_prank')");assert.ok(rows.rows.every(r=>!r.prosecdef));
  });
 }finally{await db.close();}
});
test('browser receipts reserve once, survive reload after playback, and never touch entry credentials',()=>{
 const values=new Map([['our-spark-v11:entry:key','keep-existing-key']]);const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const state={roomId:'room',role:1,prank:{id:'receipt',kind:'popcorn'}};const seen=new Set();
 const first=reservePrankPlayback(state,seen,storage);assert.ok(first);assert.equal(reservePrankPlayback(state,seen,storage),null);
 // A reload before the animation starts can still recover a lost response.
 assert.ok(reservePrankPlayback(state,new Set(),storage));rememberPrankPlayback(first.key,storage);
 assert.equal(reservePrankPlayback(state,new Set(),storage),null);assert.equal(values.get('our-spark-v11:entry:key'),'keep-existing-key');
 assert.equal(reservePrankPlayback({...state,prank:{id:'bad',kind:'unknown'}},new Set(),storage),null);
});
test('the fire must be visible, foregrounded and unobstructed before a surprise plays',()=>{
 const view={innerHeight:700,innerWidth:390,visualViewport:{height:700,width:390}};
 let hidden=false,modal=false,rect={top:180,bottom:496,left:30,right:360,height:316,width:330};
 const doc={get hidden(){return hidden;},querySelector:()=>modal?{}:null};
 const element={isConnected:true,getBoundingClientRect:()=>rect};
 assert.equal(isFireVisible(element,doc,view),true);
 rect={...rect,top:-250,bottom:66};assert.equal(isFireVisible(element,doc,view),false);
 rect={...rect,top:180,bottom:496};hidden=true;assert.equal(isFireVisible(element,doc,view),false);
 hidden=false;modal=true;assert.equal(isFireVisible(element,doc,view),false);
 modal=false;view.visualViewport.height=300;assert.equal(isFireVisible(element,doc,view),false);
 assert.equal(isFireVisible(null,doc,view),false);
});
