import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {config,dates,shanghaiDate} from '../config.mjs';
export function validateRecord(r){
 if(!r||!dates.includes(r.date)||r.flight!==config.flight||r.origin!=='FOC'||r.destination!=='TFU')throw Error('Flight/date/route mismatch');
 if(!['success','failed','departed','not_found'].includes(r.status))throw Error('Invalid status');
 if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.queriedAt)||!Number.isFinite(Date.parse(r.queriedAt)))throw Error('Timezone timestamp required');
 if(Date.parse(r.queriedAt)>Date.now()+60000)throw Error('Future observation rejected');
 if(!r.source?.name||!/^https:\/\//.test(r.source?.url)||!['automatic','manual'].includes(r.source?.kind))throw Error('Source provenance required');
 if(r.priceScope!==config.priceScope||r.currency!=='CNY')throw Error('Price scope mismatch');
 if(!['unknown','excluded','included'].includes(r.taxBasis))throw Error('Tax basis required');
 if(r.status==='success'){
  if(!Number.isFinite(r.lowest)||r.lowest<=0)throw Error('Valid lowest price required');
  if(r.zPrice!==null&&(!Number.isFinite(r.zPrice)||r.zPrice<=0))throw Error('Invalid Z price');
  if(typeof r.inventory!=='string'||!r.inventory)throw Error('Inventory required');
 }else if(r.lowest!==null||r.zPrice!==null)throw Error('Failure cannot have prices');
 if(r.departureAt!==null&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/.test(r.departureAt)||!r.departureAt.startsWith(r.date)))throw Error('Invalid departure timestamp');
 if(r.partyPriceVerified!==false)throw Error('Only displayed price mode supported');
 return r;
}
export async function loadRecords(root='.'){
 let names;const dir=path.join(root,'data/snapshots');
 try{names=await readdir(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const snapshots=await Promise.all(names.filter(n=>n.endsWith('.json')).map(async n=>JSON.parse(await readFile(path.join(dir,n),'utf8'))));
 return snapshots.flatMap(s=>s.records).sort((a,b)=>Date.parse(a.queriedAt)-Date.parse(b.queriedAt));
}
export function detectChanges(previous,current){
 if(current.status!=='success')return [];
 const last=[...previous].reverse().find(r=>r.date===current.date&&r.status==='success'&&r.source.kind===current.source.kind&&r.source.name===current.source.name&&r.priceScope===current.priceScope&&r.taxBasis===current.taxBasis&&Date.parse(r.queriedAt)<Date.parse(current.queriedAt));
 if(!last)return [];
 return ['lowest','zPrice'].flatMap(metric=>typeof last[metric]==='number'&&typeof current[metric]==='number'&&last[metric]!==current[metric]?[{metric,old:last[metric],new:current[metric],difference:current[metric]-last[metric],differenceForTwoEstimate:(current[metric]-last[metric])*2,previousAt:last.queriedAt}]:[]);
}
export function shouldQuery(date,records,now=new Date()){
 if(date<shanghaiDate(now))return false;
 const last=[...records].reverse().find(r=>r.date===date&&r.status==='success'&&r.source.kind==='automatic'&&r.departureAt);
 const departure=last?.departureAt||(date===config.focusDate?config.focusDeparture:null);
 return !departure||now.getTime()<Date.parse(departure);
}
export async function appendSnapshot(records,root='.',extra={}){
 if(!records.length)return null;
 records.forEach(validateRecord);
 const previous=await loadRecords(root),enriched=[];
 for(const r of [...records].sort((a,b)=>Date.parse(a.queriedAt)-Date.parse(b.queriedAt)))enriched.push({...r,id:randomUUID(),changes:detectChanges([...previous,...enriched],r)});
 const snapshot={...extra,schemaVersion:1,id:randomUUID(),createdAt:new Date().toISOString(),records:enriched};
 const dir=path.join(root,'data/snapshots');await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,snapshot.createdAt.replaceAll(':','-')+'-'+snapshot.id+'.json'),JSON.stringify(snapshot,null,2),{flag:'wx'});
 await exportPublic(root);return snapshot;
}
export async function exportPublic(root='.'){
 const records=await loadRecords(root),dir=path.join(root,'public/data');await mkdir(dir,{recursive:true});
 const snapshotNames=await readdir(path.join(root,'data/snapshots')).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 const scheduled=await Promise.all(snapshotNames.filter(n=>n.endsWith('.json')).map(async n=>JSON.parse(await readFile(path.join(root,'data/snapshots',n),'utf8'))));
 const lastScheduledRunAt=scheduled.filter(s=>s.runner==='github-actions'&&s.trigger==='schedule').map(s=>s.createdAt).sort().at(-1)||null;
 await writeFile(path.join(dir,'index.json'),JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),lastScheduledRunAt,config,dates,records}));
}
