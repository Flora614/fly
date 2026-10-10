import {mkdir,readdir,readFile,writeFile,rename,appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {config} from '../config.mjs';
import {shouldQuery} from '../lib/store.mjs';
import {planNotification,processNotification,verifyPublishedNotification} from '../lib/pushplus.mjs';

const test=process.argv.includes('--test'),statePath='data/notifications/state.json';
const env=process.env,now=new Date();
const automatic=env.GITHUB_EVENT_NAME==='schedule'&&env.PUSHPLUS_ENABLED==='true'&&env.PUSHPLUS_TEST_CONFIRMED==='true';
const authorized=test&&env.PUSHPLUS_TEST_AUTHORIZED==='true';
// Push events, normal manual collections and local runs never send automatically.
let outcome={status:'disabled'};
try{
 if(test?authorized:automatic){
  let state;
  try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={schemaVersion:1,messages:[]};}
  if(state.schemaVersion!==1||!Array.isArray(state.messages))throw Error('Invalid notification state');
  const names=await readdir('data/snapshots');
  const snapshots=await Promise.all(names.filter(n=>n.endsWith('.json')).map(async n=>JSON.parse(await readFile(path.join('data/snapshots',n),'utf8'))));
  const records=snapshots.flatMap(s=>s.records.map(r=>({...r,roundId:s.roundId}))).sort((a,b)=>Date.parse(a.queriedAt)-Date.parse(b.queriedAt));
  if(!test&&!state.lastTestAcceptedAt)outcome={status:'test_required'};
  else if(!test&&(!shouldQuery(config.focusDate,records,now)||!env.MONITOR_ROUND_ID))outcome={status:'stopped_or_no_round'};
  else{
   const checkpoint=async value=>{
    await mkdir(path.dirname(statePath),{recursive:true});
    await writeFile(statePath+'.tmp',JSON.stringify(value,null,2)+'\n');await rename(statePath+'.tmp',statePath);
    if(env.GITHUB_ACTIONS==='true'){
     const git=args=>execFileSync('git',args,{stdio:'pipe'});
     git(['add','--',statePath]);
     let changed=false;try{git(['diff','--cached','--quiet']);}catch(e){if(e.status!==1)throw e;changed=true;}
     if(changed){git(['commit','-m','Record PushPlus notification state']);git(['push','origin','HEAD:main']);}
    }
   };
   if(test&&!env.GITHUB_RUN_ID)throw Error('Test requires a unique GitHub Actions run id');
   const plan=planNotification({records,roundId:env.MONITOR_ROUND_ID,mode:env.MONITOR_MODE,now,testId:test?env.GITHUB_RUN_ID:null});
   outcome=await processNotification({state,plan,enabled:true,now,token:env.PUSHPLUS_TOKEN,checkpoint,beforeSend:test?undefined:item=>verifyPublishedNotification(item),sendGuard:()=>test||shouldQuery(config.focusDate,records,new Date())});
   // Also save recovered interrupted states when no new message is due.
   await checkpoint(state);
  }
 }
}catch{
 // Never print raw exception text: upstream errors may contain credentials.
 outcome={status:'notification_error',error:{code:'notification_storage_or_configuration_error'}};
}
console.log(JSON.stringify(outcome));
if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,`## PushPlus\n\n状态：${outcome.status}。${outcome.status==='accepted'?'API已受理，尚需本人确认微信实际接收。':''}\n\n安全说明：此报告不包含 Token 或原始 API 响应。\n`);
if(test&&outcome.status!=='accepted'&&!(outcome.status==='deduplicated'&&outcome.previousStatus==='accepted'))process.exitCode=1;
