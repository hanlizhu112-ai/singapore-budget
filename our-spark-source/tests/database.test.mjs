import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');
const token=()=>randomBytes(32).toString('hex');
async function prepare(db) {
  await db.exec('create role anon nologin; create role authenticated nologin;');
  await db.exec(sql);
}
async function call(db,name,params=[]) {
  await db.exec('set role anon');
  try {return (await db.query(`select public.our_spark_${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) as value`,params)).rows[0].value;}
  finally {await db.exec('reset role');}
}
async function setupKey(db,key=token()) {
  await db.query('update private_spark.settings set setup_hash=private_spark.token_hash($1)',[key]);
  return key;
}
async function room(db) {
  const setup=await setupKey(db),owner=token(),partner=token();
  const state=await call(db,'create',[setup,'我','对方',owner,partner]);
  return {state,setup,owner,partner};
}
test('real PostgreSQL permissions, capability checks and daily records',async t=>{
 const db=new PGlite();await prepare(db);
 try {
  await t.test('migration is repeatable; probe reveals no names or room identifiers',async()=>{
   await db.exec(sql);const probe=await call(db,'probe');assert.equal(probe.ok,true);assert.deepEqual(Object.keys(probe).sort(),['ok','today','version']);
  });
  await t.test('public key role cannot read/write private tables or call internal helpers',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    try {
     for(const query of ['select * from private_spark.rooms','select * from private_spark.settings','insert into private_spark.checkins values(gen_random_uuid(),current_date,0,now())',"select private_spark.token_hash('x')"]){await assert.rejects(db.exec(query),e=>e.code==='42501');}
    }finally{await db.exec('reset role');}
   }
  });
  await t.test('creation requires a separate private setup key',async()=>{
   await assert.rejects(call(db,'create',[token(),'我','对方',token(),token()]),e=>e.code==='PT403');
   assert.equal((await db.query('select count(*) from private_spark.rooms')).rows[0].count,0);
  });
  const created=await room(db),state=created.state,ownerKey=state.resumeKey,partnerKey=state.inviteKey;
  await t.test('roles are resolved on the server; partner sees no owner credential',async()=>{
   assert.equal(state.role,0);const partner=await call(db,'state',[partnerKey]);assert.equal(partner.role,1);assert.equal(partner.inviteKey,undefined);assert.ok(!JSON.stringify(partner).includes(created.owner));
   for(const bad of ['bad',null,state.roomId+'.'+token()])await assert.rejects(call(db,'state',[bad]),e=>e.code==='PT401');
  });
  await t.test('retrying the same creation is safe; fresh creations are blocked after first room',async()=>{
   const same=await call(db,'create',[created.setup,'我','对方',created.owner,created.partner]);assert.equal(same.roomId,state.roomId);
   await assert.rejects(call(db,'create',[created.setup,'我','对方',token(),token()]),e=>e.code==='PT403');
  });
  await t.test('each role can check in only once; both roles alone complete the day',async()=>{
   const first=await call(db,'checkin',[ownerKey]);assert.equal(first.added,true);assert.deepEqual(first.checked,[0]);assert.equal(first.streak,0);
   const duplicate=await call(db,'checkin',[ownerKey]);assert.equal(duplicate.added,false);
   const second=await call(db,'checkin',[partnerKey]);assert.deepEqual(second.checked,[0,1]);assert.equal(second.streak,1);assert.equal(second.total,1);
   assert.equal((await call(db,'state',[ownerKey])).streak,1);
   assert.equal((await db.query('select count(*) from private_spark.checkins')).rows[0].count,2);
   await assert.rejects(call(db,'checkin',[ownerKey,1,'2099-01-01']),e=>e.code==='42883');
  });
  await t.test('Beijing midnight and missed-day streak logic',async()=>{
   const boundary=await db.query("select private_spark.day_key('2026-10-06T15:59:59Z'::timestamptz)::text as before,private_spark.day_key('2026-10-06T16:00:00Z'::timestamptz)::text as after");
   assert.deepEqual(boundary.rows[0],{before:'2026-10-06',after:'2026-10-07'});
   const r=await db.query("select private_spark.current_streak(array['2026-10-04'::date,'2026-10-05'::date],'2026-10-06'::date) as pending,private_spark.current_streak(array['2026-10-04'::date],'2026-10-06'::date) as missed");assert.deepEqual(r.rows[0],{pending:2,missed:0});
   const hundred=await db.query("select private_spark.current_streak(array(select '2026-10-06'::date-n from generate_series(0,99)n),'2026-10-06'::date) as count");assert.equal(hundred.rows[0].count,100);
  });
  await t.test('history totals survive gaps and other room records cannot be read',async()=>{
   const other=token();const r=await db.query('insert into private_spark.rooms(owner_name,partner_name,owner_hash,partner_hash,invite_key) values($1,$2,private_spark.token_hash($3),private_spark.token_hash($4),$4) returning id',['甲','乙',other,token()]);
   await assert.rejects(call(db,'state',[r.rows[0].id+'.'+created.owner]),e=>e.code==='PT401');
   await db.query("insert into private_spark.checkins(room_id,day,role) select $1::uuid,private_spark.day_key(now())-3,r from generate_series(0,1)r",[state.roomId]);
   assert.equal((await call(db,'state',[ownerKey])).total,2);
  });
  await t.test('backup contains records and no bearer tokens or hashes',async()=>{
   const backup=await call(db,'export',[partnerKey]);assert.equal(backup.events.length,4);
   for(const secret of [created.owner,created.partner,created.setup])assert.ok(!JSON.stringify(backup).includes(secret));
   assert.deepEqual(backup.names,['我','对方']);
  });
 } finally {await db.close();}
});
test('database records remain after closing and reopening a persistent PostgreSQL store',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'spark-pg-'));
 try {
  let db=new PGlite(dir);await prepare(db);const r=await room(db);await call(db,'checkin',[r.state.resumeKey]);await db.close();
  db=new PGlite(dir);const state=await call(db,'state',[r.state.inviteKey]);assert.deepEqual(state.checked,[0]);await db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
