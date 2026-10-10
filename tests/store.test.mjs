import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {appendSnapshot,loadRecords,detectChanges,shouldQuery,validateRecord} from '../lib/store.mjs';
const quote=(p=600,t='2026-10-10T01:00:00Z')=>({date:'2026-10-20',flight:'MF8455',origin:'FOC',destination:'TFU',queriedAt:t,status:'success',lowest:p,zPrice:p,departureAt:'2026-10-20T16:35:00+08:00',inventory:'余票充足',source:{name:'厦航官网',url:'https://www.xiamenair.com/zh-cn/nticket.html',kind:'automatic'},priceScope:'official_display_per_adult',currency:'CNY',taxBasis:'unknown',partyPriceVerified:false});
test('append-only snapshots retain identical successive real observations',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mf8455-history-'));
 await appendSnapshot([quote()],root);await appendSnapshot([quote(600,'2026-10-10T01:15:00Z')],root);
 assert.equal((await readdir(path.join(root,'data/snapshots'))).length,2);
 assert.equal((await loadRecords(root)).length,2);
 const data=JSON.parse(await readFile(path.join(root,'public/data/index.json'),'utf8'));assert.equal(data.records.length,2);
});
test('a failure never creates a fare change and next success compares last good quote',()=>{
 const first=quote(),bad={...quote(null,'2026-10-10T01:15:00Z'),status:'failed'};
 assert.deepEqual(detectChanges([first],bad),[]);
 const next=quote(500,'2026-10-10T01:30:00Z'),changes=detectChanges([first,bad],next);
 assert.equal(changes.length,2);assert.equal(changes[0].difference,-100);assert.equal(changes[0].differenceForTwoEstimate,-200);
});
test('missing Z cabin cannot become a zero fare or price change',()=>{
 const q={...quote(550,'2026-10-10T01:15:00Z'),zPrice:null};
 assert.equal(detectChanges([quote()],q).filter(c=>c.metric==='zPrice').length,0);
});
test('manual source and different tax basis do not compare with automatic fares',()=>{
 const q=quote(500,'2026-10-10T01:15:00Z');
 assert.deepEqual(detectChanges([quote()],{...q,source:{...q.source,kind:'manual'}}),[]);
 assert.deepEqual(detectChanges([quote()],{...q,taxBasis:'included'}),[]);
});
test('skip focus exactly at verified Shanghai departure and retain earlier queries',()=>{
 assert.equal(shouldQuery('2026-10-20',[],new Date('2026-10-20T16:34:59+08:00')),true);
 assert.equal(shouldQuery('2026-10-20',[],new Date('2026-10-20T16:35:00+08:00')),false);
 assert.equal(shouldQuery('2026-10-19',[],new Date('2026-10-20T00:01:00+08:00')),false);
});
test('a newly observed reschedule replaces the fallback cutoff',()=>{
 assert.equal(shouldQuery('2026-10-20',[{...quote(),departureAt:'2026-10-20T18:00:00+08:00'}],new Date('2026-10-20T17:00:00+08:00')),true);
});
test('reject wrong flight, route, fake failure prices, unsafe URL and no timezone',()=>{
 assert.throws(()=>validateRecord({...quote(),flight:'MF8435'}));
 assert.throws(()=>validateRecord({...quote(),destination:'CTU'}));
 assert.throws(()=>validateRecord({...quote(),status:'failed'}));
 assert.throws(()=>validateRecord({...quote(),source:{...quote().source,url:'javascript:alert(1)'}}));
 assert.throws(()=>validateRecord({...quote(),queriedAt:'2026-10-10T09:00:00'}));
});
test('manual CLI import preserves original timestamp and keeps provenance in isolated storage',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mf8455-import-'));
 const r=quote();r.source={kind:'manual',name:'Work QA fixture',url:'https://www.xiamenair.com/zh-cn/',note:'Isolated synthetic test, never a production quote',evidence:'test-only'};
 const input=path.join(root,'input.json');await writeFile(input,JSON.stringify({records:[r]}));
 execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/import.mjs',import.meta.url)),input],{cwd:root,stdio:'pipe'});
 const saved=await loadRecords(root);assert.equal(saved.length,1);assert.equal(saved[0].queriedAt,r.queriedAt);assert.equal(saved[0].source.kind,'manual');
});
