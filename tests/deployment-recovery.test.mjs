import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {planNotification,processNotification,verifyPublishedNotification} from '../lib/pushplus.mjs';

test('a failed Pages job still starts notification handling to persist the hourly brief',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/monitor.yml',import.meta.url),'utf8');
 const job=workflow.split(/^  notify:\r?\n/m)[1];
 const condition=job.match(/^    if: (.+)$/m)[1];
 const allowed=(deploy,event='schedule',collection='success')=>{
  const context={always:()=>true,github:{event_name:event},needs:{deploy:{result:deploy},'collect-and-build':{result:collection,outputs:{active:'true'}}}};
  // GitHub property names permit hyphens; JavaScript requires brackets.
  const expression=condition.replaceAll('needs.collect-and-build','needs["collect-and-build"]');
  return (condition.includes('always()')||deploy==='success')&&runInNewContext(expression,context);
 };
 assert.equal(allowed('failure'),true,'11:24 Pages 504 must queue the brief rather than skip notify');
 assert.equal(allowed('success'),true);
 assert.equal(allowed('failure','push'),false);
 assert.equal(allowed('failure','workflow_dispatch'),false);
 assert.equal(allowed('failure','schedule','failure'),false);
});

test('Pages 504 queues an hourly brief; unchanged focus run publishes it and sends exactly once',async()=>{
 const quote=(id,at,roundId)=>({id,roundId,date:'2026-10-20',flight:'MF8455',queriedAt:at,status:'success',lowest:600,zPrice:600,departureAt:'2026-10-20T16:35:00+08:00',source:{kind:'automatic',name:'厦航官网'},priceScope:'official_display_per_adult',taxBasis:'unknown'});
 const old=quote('old','2026-10-11T02:53:00Z','old-round');
 const current=quote('hourly','2026-10-11T03:22:25Z','hourly-round');
 const state={schemaVersion:1,messages:[]};let published=[old],sends=0,saved;
 const options={state,enabled:true,token:'fixture-only',checkpoint:async value=>{saved=structuredClone(value);},beforeSend:item=>verifyPublishedNotification(item,{fetchImpl:async()=>({ok:true,json:async()=>({schemaVersion:1,records:published})})}),fetchImpl:async()=>{sends++;assert.equal(saved.messages[0].status,'sending');return {ok:true,json:async()=>({code:200,data:'fixture-receipt'})};}};
 const plan=planNotification({records:[old,current],roundId:current.roundId,mode:'full',now:new Date('2026-10-11T03:24:51Z')});
 const blocked=await processNotification({...options,plan,now:new Date('2026-10-11T03:24:51Z')});
 assert.equal(blocked.status,'retry_wait');assert.equal(sends,0);assert.equal(saved.messages[0].kind,'hourly');
 const focus=quote('focus','2026-10-11T03:40:00Z','focus-round');published=[old,current,focus];
 const noChange=planNotification({records:published,roundId:focus.roundId,mode:'focus',now:new Date('2026-10-11T03:41:00Z')});
 assert.equal(noChange,null);
 assert.equal((await processNotification({...options,plan:noChange,now:new Date('2026-10-11T03:41:00Z')})).status,'accepted');
 assert.equal((await processNotification({...options,plan:noChange,now:new Date('2026-10-11T03:42:00Z')})).status,'nothing_due');
 assert.equal(sends,1);assert.match(saved.messages[0].payload.content,/11:22:25/);
});
