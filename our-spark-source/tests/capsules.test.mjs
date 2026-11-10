import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const base=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');
const extension=readFileSync(new URL('../supabase/capsules.sql',import.meta.url),'utf8');
const token=()=>randomBytes(32).toString('hex');
async function rpc(db,name,args){await db.exec('set role anon');try{return (await db.query(`select public.our_spark_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as v`,args)).rows[0].v;}finally{await db.exec('reset role');}}
test('capsules preserve existing daily records and stay sealed until the server-side milestone',async t=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon nologin; create role authenticated nologin;');await db.exec(base);
  const setup=token(),owner=token(),partner=token();
  await db.query('update private_spark.settings set setup_hash=private_spark.token_hash($1)',[setup]);
  const room=await rpc(db,'create',[setup,'测试甲','测试乙',owner,partner]);
  await db.query('insert into private_spark.checkins(room_id,day,role) select $1::uuid,private_spark.day_key(now())-d,r from generate_series(0,35)d cross join generate_series(0,1)r',[room.roomId]);
  const before=await rpc(db,'export',[room.resumeKey]);
  await db.exec(extension);await db.exec(extension);
  await t.test('additive installation leaves all 72 checkins and original entries unchanged',async()=>{
   const after=await rpc(db,'export',[room.resumeKey]);delete before.exportedAt;delete after.exportedAt;assert.deepEqual(after,before);
   assert.equal((await rpc(db,'state',[room.inviteKey])).streak,36);
  });
  await t.test('one person can seal a letter; neither role receives its body before the milestone',async()=>{
   const sealed=await rpc(db,'seal_capsule',[room.resumeKey,60,'给未来的我们，继续发光。']);
   assert.equal(sealed.capsules.length,1);assert.equal(sealed.capsules[0].role,0);assert.equal(sealed.capsules[0].message,null);
   const other=await rpc(db,'capsules',[room.inviteKey]);assert.equal(other.capsules[0].message,null);
   assert.ok(!JSON.stringify(other).includes('继续发光'));
  });
  await t.test('lost-response retries are idempotent and sealed letters cannot be overwritten',async()=>{
   assert.equal((await rpc(db,'seal_capsule',[room.resumeKey,60,'给未来的我们，继续发光。'])).capsules.length,1);
   await assert.rejects(rpc(db,'seal_capsule',[room.resumeKey,60,'替换正文']),e=>e.code==='PT409');
  });
  await t.test('both authors are optional and independent; target and input validation run on the server',async()=>{
   await rpc(db,'seal_capsule',[room.inviteKey,60,'另一封独立的信']);
   await rpc(db,'seal_capsule',[room.resumeKey,100,'给第一百天']);
   assert.equal((await rpc(db,'capsules',[room.resumeKey])).capsules.length,3);
   for(const args of [[30,'x'],[null,'x'],[60,' '],[60,'x'.repeat(501)]])await assert.rejects(rpc(db,'seal_capsule',[room.inviteKey,...args]),e=>e.code==='PT400');
  });
  await t.test('forged keys, cross-room tokens and direct table reads cannot reveal letters',async()=>{
   await assert.rejects(rpc(db,'capsules',[room.roomId+'.'+token()]),e=>e.code==='PT401');
   const other=await db.query('insert into private_spark.rooms(owner_name,partner_name,owner_hash,partner_hash,invite_key) values($1,$2,private_spark.token_hash($3),private_spark.token_hash($4),$4) returning id',['甲','乙',token(),token()]);
   await assert.rejects(rpc(db,'capsules',[other.rows[0].id+'.'+owner]),e=>e.code==='PT401');
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(db.exec('select message from private_spark.capsules'),e=>e.code==='42501');}finally{await db.exec('reset role');}}
   const wrappers=await db.query("select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('our_spark_capsules','our_spark_seal_capsule')");assert.ok(wrappers.rows.every(x=>!x.prosecdef));
  });
  await t.test('60-day letters open together while 100-day letters remain hidden',async()=>{
   await db.query('insert into private_spark.checkins(room_id,day,role) select $1::uuid,private_spark.day_key(now())-d,r from generate_series(36,59)d cross join generate_series(0,1)r',[room.roomId]);
   const opened=await rpc(db,'capsules',[room.inviteKey]);assert.equal(opened.streak,60);
   assert.equal(opened.capsules.filter(c=>c.day===60&&c.message).length,2);assert.equal(opened.capsules.find(c=>c.day===100).message,null);
   await assert.rejects(rpc(db,'seal_capsule',[room.inviteKey,60,'新信']),e=>e.code==='PT409');
  });
  await t.test('100-day letters open at 100 days and remain readable after reopening',async()=>{
   await db.query('insert into private_spark.checkins(room_id,day,role) select $1::uuid,private_spark.day_key(now())-d,r from generate_series(60,99)d cross join generate_series(0,1)r',[room.roomId]);
   const opened=await rpc(db,'capsules',[room.inviteKey]);assert.equal(opened.capsules.find(c=>c.day===100).message,'给第一百天');
   assert.equal((await rpc(db,'capsules',[room.resumeKey])).capsules.find(c=>c.day===100).message,'给第一百天');
  });
 }finally{await db.close();}
});
