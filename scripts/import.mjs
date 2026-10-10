import {readFile} from 'node:fs/promises';
import {appendSnapshot,validateRecord} from '../lib/store.mjs';
const filename=process.argv[2];if(!filename)throw Error('Usage: npm run import -- work-results.json');
const input=JSON.parse(await readFile(filename,'utf8')),records=Array.isArray(input)?input:input.records;
if(!Array.isArray(records)||!records.length)throw Error('Non-empty records required');
for(const r of records){if(r.source?.kind!=='manual'||!r.source?.note||!r.source?.evidence)throw Error('Manual imports require kind=manual, note and evidence');validateRecord(r);}
const snapshot=await appendSnapshot(records,'.',{mode:'manual-import',pushesEnabled:false});
console.log('Imported '+snapshot.records.length+' observations; original times retained.');