import test from 'node:test';
import assert from 'node:assert/strict';
import {getFireStage,getNextStage,isStageLocked,MILESTONES} from '../src/stages.mjs';
import {createCloudClient} from '../src/cloud.mjs';

test('growth thresholds include 60 days and existing 33-day rooms immediately show a bonfire',()=>{
  for(const [days,id,next] of [[0,'spark',7],[6,'spark',7],[7,'flame',30],[29,'flame',30],[30,'bonfire',60],[33,'bonfire',60],[59,'bonfire',60],[60,'blaze',100],[99,'blaze',100],[100,'wildfire',null],[365,'wildfire',null]]){
    assert.equal(getFireStage(days).id,id,`${days} days`);
    assert.equal(getNextStage(days)?.day??null,next,`${days} days to next stage`);
  }
  assert.deepEqual(MILESTONES.map(s=>s.day),[7,30,60,100]);
});

test('both existing entries reopen the same 33-day room and gallery previews leave all stored records intact',async()=>{
  const config={url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_example_public_test_key'};
  const href='https://example.github.io/singapore-budget/our-spark-test/';
  const roomId='11111111-1111-4111-8111-111111111111';
  const keys=[roomId+'.'+'a'.repeat(64),roomId+'.'+'b'.repeat(64)];
  const events=Array.from({length:66},(_,i)=>({day:new Date(Date.UTC(2026,9,6+Math.floor(i/2))).toISOString().slice(0,10),role:i%2,created_at:'2026-11-07T10:00:00Z'}));
  const requests=[];
  for(let role=0;role<2;role++){
    const prefix=`our-spark-v11:${config.url}:${new URL(href).pathname}`;
    const values=new Map([[prefix+':key',keys[role]],['our-spark-config-v11',JSON.stringify(config)],['unrelated-setting','keep-me']]);
    const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
    const snapshot=JSON.stringify([...values]);
    const saved={roomId,names:['测试甲','测试乙'],role,today:'2026-11-07',checked:[0,1],streak:33,total:33,events,createdAt:'2026-10-06T10:00:00Z',resumeKey:keys[role],...(role===0?{inviteKey:keys[1]}:{})};
    const client=createCloudClient({config,href,storage,fetchImpl:async(url,options)=>{
      requests.push(url.split('/').at(-1));assert.equal(JSON.parse(options.body).p_key,keys[role]);return Response.json(saved);
    }});
    const room=await client.importEntry({});
    const before=JSON.stringify(room);
    assert.equal(getFireStage(room.streak).id,'bonfire');
    for(const day of [7,30,60,100])getFireStage(day);
    assert.equal(JSON.stringify(room),before);
    assert.equal(JSON.stringify([...values]),snapshot);
    assert.deepEqual(await client.export(),saved);
    const reopened=createCloudClient({config,href,storage,fetchImpl:async()=>Response.json(saved)});
    assert.deepEqual(await reopened.importEntry({}),saved);
  }
  assert.deepEqual(requests,['our_spark_state','our_spark_export','our_spark_state','our_spark_export']);
});

test('60-day and 100-day artwork stays locked until its own threshold, without hiding earlier previews',()=>{
  for(const [days,locked] of [[0,[60,100]],[33,[60,100]],[59,[60,100]],[60,[100]],[99,[100]],[100,[]],[365,[]]]){
    assert.deepEqual(MILESTONES.filter(stage=>isStageLocked(stage,days)).map(stage=>stage.day),locked,`${days} day room`);
  }
  assert.equal(isStageLocked(getFireStage(60),undefined),true);
});
