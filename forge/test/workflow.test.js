// Local contract/counterexample checks. These are not cloud integration tests.
// Copyright (c) 2026 Francisco Angulo de Lafuente. MIT.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createReviewService,paragraphsFromPage,pageIdFromInput,ReviewError} from '../src/domain.js';

const context={extension:{issue:{id:'101'}}};
function page(texts=['Records must be retained for 3 years.'],version=1,id='456') {
  return {id,status:'current',title:'Fictional records policy',version:{number:version},
    body:{atlas_doc_format:{value:JSON.stringify({type:'doc',version:1,
      content:texts.map(text=>({type:'paragraph',content:[{type:'text',text}]}))})}}};
}
function harness() {
  const records=new Map();const calls=[];let current=page();let denied=false;let issueDenied=false;let canEdit=true;
  const deps={
    async authorizeIssue(id){calls.push(['issue',id]);if(issueDenied)throw new ReviewError('ISSUE_UNAVAILABLE','Unavailable.');
      return {issueId:id,siteOrigin:'https://example.atlassian.net',canEdit};},
    async getPage(id,body){calls.push(['page',id,body]);if(denied)throw new ReviewError('SOURCE_UNAVAILABLE','Unavailable.');
      assert.equal(id,'456');return structuredClone(current);},
    async get(key){calls.push(['get',key]);return records.get(key);},
    async create(key,value){calls.push(['create',key]);if(records.has(key))throw new Error('Key exists');
      records.set(key,structuredClone(value));},
    async query(prefix){calls.push(['query',prefix]);return {results:[...records]
      .filter(([key])=>key.startsWith(prefix)).map(([key,value])=>({key,value})),nextCursor:null};},
    now:()=> '2026-11-10T19:00:00.000Z',
  };
  return {service:createReviewService(deps),records,calls,deps,
    setPage:p=>{current=p;},denyPage:()=>{denied=true;},denyIssue:()=>{issueDenied=true;},denyEdit:()=>{canEdit=false;}};
}
async function capture(h,requestId='capture_123456') {
  const p=await h.service.preview(context,{source:'456'});const q=p.paragraphs[0];
  return h.service.capture(context,{pageId:p.pageId,version:p.version,ordinal:q.ordinal,digest:q.digest,requestId});
}
const hasCode=code=>error=>error instanceof ReviewError&&error.code===code;

test('original research core remains byte-exact inside the Forge package',()=>{
  const copy=readFileSync(new URL('../src/core/drift.js',import.meta.url));
  const provenance=JSON.parse(readFileSync(new URL('../CORE_PROVENANCE.json',import.meta.url)));
  assert.equal(createHash('sha256').update(copy).digest('hex'),provenance.sha256);
});
test('captured evidence survives later material changes and supplies both passages',async()=>{
  const h=harness();const citation=await capture(h);
  h.setPage(page(['Records must be retained for 5 years.'],2));
  const result=await h.service.review(context,{id:citation.id});
  assert.equal(result.verdict,'REVIEW_MATERIAL');assert.equal(result.needsReview,true);
  assert.equal(result.originalQuote,'Records must be retained for 3 years.');
  assert.equal(result.successor.text,'Records must be retained for 5 years.');
  assert.deepEqual(result.factsRemoved,['3']);assert.deepEqual(result.factsAdded,['5']);
  assert.equal(result.capturedVersion,1);assert.equal(result.currentVersion,2);
  assert.equal(h.records.size,1);assert.equal([...h.records.values()][0].version,1);
});
test('an unchanged quote does not hide the page version changing elsewhere',async()=>{
  const h=harness();const c=await capture(h);
  h.setPage(page(['Records must be retained for 3 years.','New surrounding context.'],2));
  const r=await h.service.review(context,{id:c.id});
  assert.equal(r.verdict,'UNCHANGED');assert.equal(r.pageVersionChanged,true);assert.equal(r.sourceDocumentChanged,true);
});
test('revoked page permission hides titles in the list and denies the old quotation',async()=>{
  const h=harness();const c=await capture(h);h.denyPage();
  assert.deepEqual(await h.service.list(context,{}),{items:[],nextCursor:null});
  await assert.rejects(h.service.review(context,{id:c.id}),hasCode('SOURCE_UNAVAILABLE'));
});
test('issue access is checked before storage access, including forged payload issue IDs',async()=>{
  const h=harness();await capture(h);h.calls.length=0;h.denyIssue();
  await assert.rejects(h.service.list(context,{issueId:'999'}),hasCode('ISSUE_UNAVAILABLE'));
  assert.equal(h.calls.filter(c=>['get','create','query','page'].includes(c[0])).length,0);
});
test('a citation from another issue is not reachable with a client-selected id',async()=>{
  const h=harness();const c=await capture(h);
  await assert.rejects(h.service.review({extension:{issue:{id:'202'}}},{id:c.id,issueId:'101'}),hasCode('INVALID_CITATION'));
});
test('read-only issue access does not grant capture writes',async()=>{
  const h=harness();h.denyEdit();
  const p=await h.service.preview(context,{source:'456'});assert.equal(p.pageId,'456');
  await assert.rejects(h.service.capture(context,{pageId:'456',version:p.version,ordinal:1,
    digest:p.paragraphs[0].digest,requestId:'capture_readonly'}),hasCode('ISSUE_EDIT_REQUIRED'));
  assert.equal(h.records.size,0);assert.equal(h.calls.filter(c=>c[0]==='create').length,0);
});
test('version and paragraph digest races are rejected without a write',async()=>{
  const h=harness();const p=await h.service.preview(context,{source:'456'});
  h.setPage(page(['Records must be retained for 5 years.'],2));
  await assert.rejects(h.service.capture(context,{pageId:'456',version:1,ordinal:1,
    digest:p.paragraphs[0].digest,requestId:'capture_123456'}),hasCode('SOURCE_CHANGED'));
  assert.equal(h.records.size,0);
  await assert.rejects(h.service.capture(context,{pageId:'456',version:2,ordinal:1,
    digest:'0'.repeat(64),requestId:'capture_123456'}),hasCode('SOURCE_CHANGED'));
  assert.equal(h.records.size,0);
});
test('concurrent capture intents preserve both audit records; retrying an intent is idempotent',async()=>{
  const h=harness();const [a,b]=await Promise.all([capture(h,'capture_first123'),capture(h,'capture_second123')]);
  assert.notEqual(a.id,b.id);assert.equal(h.records.size,2);
  const again=await capture(h,'capture_first123');assert.equal(again.id,a.id);
  assert.equal(again.alreadySaved,true);assert.equal(h.records.size,2);
});
test('only same-site HTTPS Confluence page URLs are accepted',()=>{
  const origin='https://example.atlassian.net';
  assert.equal(pageIdFromInput(origin+'/wiki/spaces/POL/pages/456/Policy',origin),'456');
  assert.equal(pageIdFromInput(origin+'/wiki/pages/viewpage.action?pageId=456',origin),'456');
  for(const bad of ['https://example.atlassian.net.evil.test/wiki/pages/456','http://example.atlassian.net/wiki/pages/456',
    'https://user:secret@example.atlassian.net/wiki/pages/456','file:///456','javascript:alert(1)',
    origin+'/wiki/pages/viewpage.action?pageId=456&pageId=789'])
    assert.throws(()=>pageIdFromInput(bad,origin),ReviewError);
});
test('unsupported rich nodes and oversized input cannot become an optimistic verdict',()=>{
  for(const value of ['not json',JSON.stringify({type:'doc',version:1,content:[{type:'mediaSingle'}]}),
    page(['x'.repeat(801)]).body.atlas_doc_format.value,
    page(Array.from({length:81},()=> 'A paragraph.')).body.atlas_doc_format.value,
    ' '.repeat(131073)]) {
    const p=page();p.body.atlas_doc_format.value=value;
    assert.throws(()=>paragraphsFromPage(p),hasCode('SOURCE_UNSUPPORTED'));
  }
});
test('untrusted script-looking content remains literal evidence, never executable instructions',()=>{
  const malicious='<script>globalThis.userData="send elsewhere"</script>';
  assert.equal(paragraphsFromPage(page([malicious])).paragraphs[0].text,malicious);
  assert.equal(globalThis.userData,undefined);
});
test('an earlier current version cannot silently validate a newer captured snapshot',async()=>{
  const h=harness();h.setPage(page(undefined,3));const c=await capture(h);h.setPage(page(undefined,2));
  await assert.rejects(h.service.review(context,{id:c.id}),hasCode('SOURCE_CHANGED'));
});
test('a barrier race on the same capture intent preserves the first timestamp',async()=>{
  const h=harness();let reads=0;let ticks=0;let release;
  const barrier=new Promise(r=>{release=r;});
  const originalGet=h.deps.get;
  h.deps.get=async key=>{if(++reads<=2){if(reads===2)release();await barrier;return undefined;}return originalGet(key);};
  h.deps.now=()=>`2026-11-10T19:00:0${++ticks}.000Z`;
  const [a,b]=await Promise.all([capture(h,'capture_shared_123'),capture(h,'capture_shared_123')]);
  assert.equal(a.id,b.id);assert.equal(a.capturedAt,b.capturedAt);
  assert.equal(h.records.size,1);assert.equal([...h.records.values()][0].capturedAt,a.capturedAt);
  assert.equal(Number(a.alreadySaved)+Number(b.alreadySaved),1);
});
test('an atomic write failure without a stored winner is never reported as success',async()=>{
  const h=harness();h.deps.create=async()=>{throw new Error('Simulated storage unavailable');};
  await assert.rejects(capture(h),/Simulated storage unavailable/);assert.equal(h.records.size,0);
});
test('a conflicting record must bind all source fields, not merely a valid issue and timestamp',async()=>{
  const h=harness();h.deps.create=async(key,value)=>{
    h.records.set(key,{...value,sourceDigest:'f'.repeat(64)});throw new Error('Simulated conflict');};
  await assert.rejects(capture(h),hasCode('INVALID_CITATION'));
});
test('the retained modal_v2 rule detects can-to-will changes and identifies itself',async()=>{
  const h=harness();h.setPage(page(['We can retain records.']));const c=await capture(h);
  h.setPage(page(['We will retain records.'],2));
  const review=await h.service.review(context,{id:c.id});
  assert.equal(review.rule,'modal_v2');assert.equal(review.verdict,'REVIEW_MATERIAL');
  assert.deepEqual(review.factsRemoved,['can']);assert.deepEqual(review.factsAdded,['will']);
});
