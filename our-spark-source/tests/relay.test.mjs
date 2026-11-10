import test from 'node:test';
import assert from 'node:assert/strict';
import {getRelayReaction} from '../src/relay.mjs';
test('relay reacts only to newly confirmed checkins, never initial loading, duplicates or a new day',()=>{
 const state={roomId:'room',today:'2026-11-10',checked:[]};
 assert.equal(getRelayReaction(null,{...state,checked:[0,1]}),null);
 assert.deepEqual(getRelayReaction(state,{...state,checked:[1]}),{kind:'stoke',role:1});
 assert.deepEqual(getRelayReaction({...state,checked:[1]},{...state,checked:[0,1]}),{kind:'complete',role:0});
 assert.equal(getRelayReaction({...state,checked:[0,1]},{...state,checked:[0,1]}),null);
 assert.equal(getRelayReaction(state,{...state,today:'2026-11-11',checked:[0]}),null);
});
