import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {appendSnapshot} from '../lib/store.mjs';
import {planNotification,processNotification,sendPushPlus,hourKey,PAGE_URL} from '../lib/pushplus.mjs';

// Synthetic fixtures stay in isolated temporary storage; no real WeChat calls.
const now=new Date('2026-10-10T03:30:00Z');
const quote=(price=600,at='2026-10-10T03:00:00Z',roundId='r1')=>({id:at,roundId,date:'2026-10-20',flight:'MF8455',origin:'FOC',destination:'TFU',queriedAt:at,status:'success',lowest:price,zPrice:price,departureAt:'2026-10-20T16:35:00+08:00',inventory:'余票充足',source:{name:'厦航官网',url:'https://www.xiamenair.com/zh-cn/',kind:'automatic'},priceScope:'official_display_per_adult',currency:'CNY',taxBasis:'unknown',partyPriceVerified:false});
const args=(records,mode='focus')=>({records,roundId:'r2',mode,now});
const plan=()=>planNotification(args([quote(),quote(500,'2026-10-10T03:15:00Z','r2')]));
const state=()=>({schemaVersion:1,messages:[]});
const accepted=async()=>({ok:true,json:async()=>({code:200,data:'fixture-only-receipt'})});

test('one merged low-price notice includes both changes, old/new, two-person estimate and page',()=>{
 const p=plan();assert.equal(p.kind,'change');assert.match(p.payload.title,/低于550/);
 assert.match(p.payload.content,/¥600 → ¥500/);assert.match(p.payload.content,/两人合计估算 -200 元/);
 assert.match(p.payload.content,/最低价变化/);assert.match(p.payload.content,/Z舱变化/);
 assert.ok(p.payload.content.includes(PAGE_URL));assert.match(p.payload.content,/Asia\/Shanghai/);
});
test('unchanged focus has no extra notice; hourly brief remains, including strict 550 threshold',()=>{
 const records=[quote(550),quote(550,'2026-10-10T03:15:00Z','r2')];
 assert.equal(planNotification(args(records)),null);
 const p=planNotification(args(records,'full'));assert.equal(p.kind,'hourly');assert.match(p.payload.content,/价格未变化/);assert.doesNotMatch(p.payload.title,/低于550/);
 assert.equal(hourKey(new Date('2026-10-10T16:30:00Z')),'2026-10-11 00');
});
test('failed query never becomes a change or sold-out notice; hourly uses timestamped history',()=>{
 const bad={...quote(null,'2026-10-10T03:15:00Z','r2'),status:'failed'};
 assert.equal(planNotification(args([quote(),bad])),null);
 const p=planNotification(args([quote(),bad],'full'));
 assert.match(p.payload.content,/不是本轮实时价格/);assert.match(p.payload.content,/最新有效报价时间/);
 assert.match(p.payload.content,/¥600\/人/);assert.doesNotMatch(p.payload.content,/售罄|¥null|¥0/);
 const empty=planNotification(args([bad],'full'));assert.match(empty.payload.content,/没有有效自动报价/);
});
test('ignore manual prices, missing Z and tax basis changes',()=>{
 const first=quote();const next={...quote(600,'2026-10-10T03:15:00Z','r2'),zPrice:null};
 assert.equal(planNotification(args([first,next])),null);
 assert.equal(planNotification(args([first,{...next,lowest:500,taxBasis:'included'}])),null);
 const manual={...quote(400,'2026-10-10T03:25:00Z','r2'),source:{...first.source,kind:'manual'}};
 assert.equal(planNotification(args([first,manual])),null);
});
test('departure cutoff preserves existing reschedule handling and stops focus notices',()=>{
 const records=[quote(),quote(500,'2026-10-10T03:15:00Z','r2')];
 assert.equal(planNotification({...args(records,'full'),now:new Date('2026-10-20T16:35:00+08:00')}),null);
 assert.ok(planNotification({...args(records,'full'),records:records.map(r=>({...r,departureAt:'2026-10-20T18:00:00+08:00'})),now:new Date('2026-10-20T17:00:00+08:00')}));
});
test('test message is explicitly historical and does not require a monitoring round',()=>{
 const p=planNotification({records:[quote()],now,testId:'123'});
 assert.equal(p.key,'test:123');assert.match(p.payload.content,/没有额外实时查价/);assert.match(p.payload.content,/最新有效报价时间/);
});
test('accepted send is durably checkpointed before network and deduplicated across re-runs',async()=>{
 const s=state(),checkpoints=[];let calls=0;
 const run=()=>processNotification({state:s,plan:plan(),enabled:true,now,token:'synthetic-test-token',checkpoint:async v=>checkpoints.push(structuredClone(v)),fetchImpl:async(url,opts)=>{
  calls++;assert.equal(checkpoints.at(-1).messages[0].status,'sending');
  assert.equal(url,'https://www.pushplus.plus/send');assert.equal(opts.redirect,'error');
  const body=JSON.parse(opts.body);assert.equal(body.channel,'wechat');assert.equal(body.token,'synthetic-test-token');assert.ok(!url.includes(body.token));return accepted();
 }});
 assert.equal((await run()).status,'accepted');assert.equal((await run()).status,'deduplicated');assert.equal(calls,1);
 assert.ok(!JSON.stringify(s).includes('synthetic-test-token'));
});
test('disabled or failed durable checkpoint cannot send',async()=>{
 let calls=0;const a={state:state(),plan:plan(),enabled:false,now,token:'test',checkpoint:async()=>{},fetchImpl:async()=>{calls++;return accepted();}};
 assert.equal((await processNotification(a)).status,'disabled');
 await assert.rejects(processNotification({...a,enabled:true,checkpoint:async()=>{throw Error('fixture storage failure');}}));assert.equal(calls,0);
});
test('rejected API sends save sanitized retry state and stop after three attempts',async()=>{
 const s=state();let calls=0;
 const a={state:s,plan:plan(),enabled:true,now,token:'DO-NOT-LEAK',checkpoint:async()=>{},fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({code:429,msg:'DO-NOT-LEAK'})};}};
 assert.equal((await processNotification(a)).status,'retry_wait');
 assert.equal((await processNotification({...a,now:new Date(now.getTime()+1000)})).status,'retry_not_due');
 await processNotification({...a,now:new Date(now.getTime()+15*60000)});
 assert.equal((await processNotification({...a,now:new Date(now.getTime()+45*60000)})).status,'exhausted');
 assert.equal(calls,3);assert.equal(s.messages[0].error.code,'api_429');assert.ok(!JSON.stringify(s).includes('DO-NOT-LEAK'));
});
test('network ambiguity and interrupted sends do not retry into duplicate WeChat messages',async()=>{
 const s=state();const a={state:s,plan:plan(),enabled:true,now,token:'secret',checkpoint:async()=>{},fetchImpl:async()=>{throw Error('secret timeout');}};
 assert.equal((await processNotification(a)).status,'uncertain');
 assert.equal((await processNotification(a)).status,'deduplicated');
 s.messages[0].status='sending';assert.equal((await processNotification(a)).previousStatus,'uncertain');
 assert.equal(s.messages[0].error.code,'interrupted_send_unknown');
});
test('new brief supersedes failed old notice rather than sending multiple messages in one round',async()=>{
 const s=state();let calls=0;const a={state:s,plan:plan(),enabled:true,now,token:'test',checkpoint:async()=>{},fetchImpl:async()=>({ok:true,json:async()=>({code:400})})};
 await processNotification(a);
 const p=planNotification({...args([quote(),quote(500,'2026-10-10T03:15:00Z','r2')],'full'),now:new Date('2026-10-10T04:00:00Z')});
 await processNotification({...a,plan:p,fetchImpl:async()=>{calls++;return accepted();}});
 assert.equal(s.messages[0].status,'superseded');assert.equal(calls,1);
});
test('missing secret and untrusted response cannot leak secrets or be reported as delivered',async()=>{
 assert.equal((await sendPushPlus({},'')).error.code,'missing_secret');
 assert.equal((await sendPushPlus({},'test',{fetchImpl:async()=>({ok:true,json:async()=>({code:200})})})).status,'uncertain');
 assert.equal((await sendPushPlus({},'test',{fetchImpl:async()=>({ok:false,status:503})})).status,'uncertain');
});
test('CLI test authorization is mandatory even if automatic sending is enabled',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mf8455-push-auth-'));
 const script=fileURLToPath(new URL('../scripts/notify.mjs',import.meta.url));
 assert.throws(()=>execFileSync(process.execPath,[script,'--test'],{cwd:root,env:{...process.env,GITHUB_EVENT_NAME:'schedule',PUSHPLUS_ENABLED:'true',PUSHPLUS_TEST_CONFIRMED:'true',PUSHPLUS_TEST_AUTHORIZED:'false'},stdio:'pipe'}));
});
test('CLI sends one mocked test from snapshots, persists no token and preserves exported prices',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mf8455-push-cli-'));
 await appendSnapshot([quote()],root,{roundId:'r1'});
 const exported=await readFile(path.join(root,'public/data/index.json'),'utf8');
 const stub=path.join(root,'mock.mjs');await writeFile(stub,"globalThis.fetch=async()=>({ok:true,json:async()=>({code:200,data:'fixture'})});");
 const script=fileURLToPath(new URL('../scripts/notify.mjs',import.meta.url));
 const env={...process.env,GITHUB_ACTIONS:'false',GITHUB_RUN_ID:'fixture-run',PUSHPLUS_TEST_AUTHORIZED:'true',PUSHPLUS_TOKEN:'ISOLATED-NOT-A-REAL-TOKEN',GITHUB_STEP_SUMMARY:''};
 const run=()=>execFileSync(process.execPath,['--import',pathToFileURL(stub).href,script,'--test'],{cwd:root,env,encoding:'utf8'});
 assert.match(run(),/accepted/);assert.match(run(),/deduplicated/);
 const saved=await readFile(path.join(root,'data/notifications/state.json'),'utf8');assert.ok(!saved.includes(env.PUSHPLUS_TOKEN));
 assert.ok(JSON.parse(saved).lastTestAcceptedAt);assert.equal(JSON.parse(saved).messages.length,1);
 assert.equal(await readFile(path.join(root,'public/data/index.json'),'utf8'),exported);
});
test('automatic CLI respects all gates and preserves history when notification transport fails',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mf8455-push-auto-'));
 await appendSnapshot([quote()],root,{roundId:'r1'});
 await appendSnapshot([{...quote(null,'2026-10-10T03:15:00Z','r2'),status:'failed'}],root,{roundId:'r2'});
 const exported=await readFile(path.join(root,'public/data/index.json'),'utf8');
 const stub=path.join(root,'mock.mjs');await writeFile(stub,"const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['2026-10-10T03:30:00Z']));}static now(){return RealDate.parse('2026-10-10T03:30:00Z');}};globalThis.fetch=async()=>{throw Error('ISOLATED-SECRET');};");
 const script=fileURLToPath(new URL('../scripts/notify.mjs',import.meta.url));
 const env={...process.env,GITHUB_ACTIONS:'false',GITHUB_EVENT_NAME:'schedule',PUSHPLUS_ENABLED:'true',PUSHPLUS_TEST_CONFIRMED:'true',PUSHPLUS_TOKEN:'ISOLATED-SECRET',MONITOR_ROUND_ID:'r2',MONITOR_MODE:'full',GITHUB_STEP_SUMMARY:''};
 const run=overrides=>execFileSync(process.execPath,['--import',pathToFileURL(stub).href,script],{cwd:root,env:{...env,...overrides},encoding:'utf8'});
 assert.match(run(),/test_required/);
 const {mkdir}=await import('node:fs/promises');await mkdir(path.join(root,'data/notifications'),{recursive:true});
 await writeFile(path.join(root,'data/notifications/state.json'),JSON.stringify({...state(),lastTestAcceptedAt:now.toISOString()}));
 assert.match(run({PUSHPLUS_ENABLED:'false'}),/disabled/);assert.match(run({GITHUB_EVENT_NAME:'workflow_dispatch'}),/disabled/);
 assert.match(run(),/uncertain/);
 const saved=await readFile(path.join(root,'data/notifications/state.json'),'utf8');assert.ok(!saved.includes(env.PUSHPLUS_TOKEN));
 const message=JSON.parse(saved).messages[0];assert.equal(message.status,'uncertain');assert.match(message.payload.content,/不是本轮实时价格/);
 assert.equal(await readFile(path.join(root,'public/data/index.json'),'utf8'),exported);
});
