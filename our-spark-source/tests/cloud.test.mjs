import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {normalizeConfig,parseEntry,makeEntryLink,secureToken,createCloudClient} from '../src/cloud.mjs';
const config={url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_example_public_test_key'};
const href='https://example.github.io/singapore-budget/our-spark-test/';
const key=randomUUID()+'.'+secureToken();
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('only a Supabase HTTPS project and browser publishable key are accepted',()=>{
 assert.deepEqual(normalizeConfig(config),config);
 for(const url of ['http://abcdefghijklmnopqrst.supabase.co','https://evil.example','https://abcdefghijklmnopqrst.supabase.co.evil.example'])assert.throws(()=>normalizeConfig({...config,url}));
 assert.throws(()=>normalizeConfig({...config,publishableKey:'sb_secret_private'}));
});
test('invites retain the GitHub subfolder and put credentials only in the fragment',()=>{
 const link=makeEntryLink(href,config,key),url=new URL(link);assert.equal(url.pathname,new URL(href).pathname);assert.equal(url.search,'');assert.equal(parseEntry(link).key,key);assert.deepEqual(parseEntry(link).config,config);
 assert.throws(()=>parseEntry(href+'#key=short'));
});
test('independent browser stores retain only their own role; requests omit login cookies and secret headers',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});const body=JSON.parse(options.body);return Response.json({role:body.p_key===key?0:1,resumeKey:body.p_key});};
 const owner=createCloudClient({config,href,storage:memory(),fetchImpl}),partner=createCloudClient({config,href,storage:memory(),fetchImpl});
 await owner.importEntry({key});const partnerKey=randomUUID()+'.'+secureToken();await partner.importEntry({key:partnerKey});
 assert.equal((await owner.api()).role,0);assert.equal((await partner.api({action:'checkin',role:0,day:'2099-01-01'})).role,1);
 const last=calls.at(-1);assert.equal(last.options.credentials,'omit');assert.equal(last.options.referrerPolicy,'no-referrer');assert.deepEqual(JSON.parse(last.options.body),{p_key:partnerKey});assert.ok(!last.url.includes(partnerKey));assert.equal(last.options.headers.Authorization,undefined);
});
test('invalid invitations cannot replace an existing working device credential',async()=>{
 const store=memory();const bad=randomUUID()+'.'+secureToken();
 const fetchImpl=async(_,options)=>JSON.parse(options.body).p_key===bad?Response.json({code:'PT401',message:'入口无效'},{status:401}):Response.json({resumeKey:key});
 const client=createCloudClient({config,href,storage:store,fetchImpl});await client.importEntry({key});await assert.rejects(client.importEntry({key:bad}));assert.equal((await client.api()).resumeKey,key);
});
test('room creation retries use the same private tokens after a lost response',async()=>{
 const bodies=[];let first=true;
 const client=createCloudClient({config,href,storage:memory(),fetchImpl:async(_,options)=>{const body=JSON.parse(options.body);bodies.push(body);if(first){first=false;throw new Error('offline');}return Response.json({resumeKey:randomUUID()+'.'+body.p_owner_token});}});
 await client.importEntry({setup:secureToken()});await assert.rejects(client.api({action:'create',owner:'我',partner:'他'}));await client.api({action:'create',owner:'我',partner:'他'});
 assert.equal(bodies[0].p_owner_token,bodies[1].p_owner_token);assert.equal(bodies[0].p_partner_token,bodies[1].p_partner_token);assert.equal(client.hasSetup(),false);
});
