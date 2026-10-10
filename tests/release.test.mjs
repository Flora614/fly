import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('production notification job waits for successful Pages deployment',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/monitor.yml',import.meta.url),'utf8');
 const jobs=[...workflow.matchAll(/^  ([\w-]+):\r?\n([\s\S]*?)(?=^  [\w-]+:\r?\n|$(?![\s\S]))/gm)];
 const sendJob=jobs.find(([,name,body])=>body.includes('run: node scripts/notify.mjs'));
 assert.ok(sendJob,'An automatic notification job must exist');
 assert.match(sendJob[2],/^    needs:.*\bdeploy\b/m,'Sending before deployment exposes the previous webpage quote');
 assert.match(sendJob[2],/needs\.deploy\.result == 'success'/,'Failed deployment must never be followed by a real fare notification');
 assert.match(workflow,/cron: '7 \* 10-21 10 \*'/);assert.match(workflow,/cron: '22,37,52 \* 10-21 10 \*'/);
});
