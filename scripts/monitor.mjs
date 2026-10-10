import {config,dates,queryUrl} from '../config.mjs';
import {appendSnapshot,loadRecords,shouldQuery,exportPublic} from '../lib/store.mjs';
import {XiamenAirProvider} from '../lib/providers/xiamenair.mjs';
const arg=process.argv.find(a=>a.startsWith('--date=')),mode=process.argv.includes('--focus')?'focus':'full';
const selected=arg?[arg.slice(7)]:mode==='focus'?[config.focusDate]:dates;
if(selected.some(d=>!dates.includes(d)))throw Error('Date outside configured range');
const previous=await loadRecords(),pending=selected.filter(d=>shouldQuery(d,previous));
if(!pending.length){console.log('No flights remain to query. History retained.');process.exit(0);}
const Provider=process.env.PRICE_PROVIDER_MODULE?(await import(process.env.PRICE_PROVIDER_MODULE)).default:XiamenAirProvider;
const provider=new Provider(),records=[];
try{
 await provider.init();
 for(const date of pending){const r=await provider.query(date);records.push(r);console.log(date+' '+r.status+' minimum='+(r.lowest??'-')+' Z='+(r.zPrice??'-')+' inventory='+r.inventory);}
}catch(error){
 for(const date of pending.filter(d=>!records.some(r=>r.date===d)))records.push({date,flight:config.flight,origin:'FOC',destination:'TFU',queriedAt:new Date().toISOString(),status:'failed',lowest:null,zPrice:null,departureAt:null,inventory:'unknown',source:{name:'厦航官网',url:queryUrl(date),kind:'automatic'},currency:'CNY',priceScope:config.priceScope,taxBasis:'unknown',taxPerAdult:null,partyPriceVerified:false,error:{code:'provider_error',message:error.message}});
}finally{await provider.close().catch(()=>{});}
const snapshot=await appendSnapshot(records,'.',{mode,transport:'playwright',runner:process.env.GITHUB_ACTIONS==='true'?'github-actions':'local',trigger:process.env.GITHUB_EVENT_NAME||'local',pushesEnabled:false});
console.log(JSON.stringify({snapshot:snapshot?.id,successful:records.filter(r=>r.status==='success').length,failed:records.filter(r=>r.status==='failed').length,changes:snapshot?.records.flatMap(r=>r.changes).length},null,2));
