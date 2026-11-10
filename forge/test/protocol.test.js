import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unwrap} from '../src/frontend/protocol.ts';
test('Bridge direct and optional-metadata responses preserve the same payload',()=>{
  const data={title:'Fictional source',version:3};
  assert.deepEqual(unwrap({ok:true,data}),data);
  assert.deepEqual(unwrap({body:{ok:true,data},metadata:{}}),data);
});
test('both Bridge response forms surface a domain error instead of accepting a result',()=>{
  const error={ok:false,error:{code:'SOURCE_CHANGED',message:'Reload the source.'}};
  assert.throws(()=>unwrap(error),/Reload the source/);
  assert.throws(()=>unwrap({body:error,metadata:{}}),/Reload the source/);
});
test('malformed or truncated resolver envelopes fail closed',()=>{
  for(const raw of [undefined,null,[],{},'ok',{ok:'true'},{ok:true},{body:null},{ok:false,error:{message:'x'.repeat(1001)}}])
    assert.throws(()=>unwrap(raw));
});
