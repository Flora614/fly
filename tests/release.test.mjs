import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('production notification handling waits for Pages and defers unpublished fares even after deployment failure',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/monitor.yml',import.meta.url),'utf8');
 const jobs=[...workflow.matchAll(/^  ([\w-]+):\r?\n([\s\S]*?)(?=^  [\w-]+:\r?\n|$(?![\s\S]))/gm)];
 const sendJob=jobs.find(([,name,body])=>body.includes('run: node scripts/notify.mjs'));
 assert.ok(sendJob,'An automatic notification job must exist');
 assert.match(sendJob[2],/^    needs:.*\bdeploy\b/m,'Sending before deployment exposes the previous webpage quote');
 assert.match(sendJob[2],/if: always\(\).*needs\.collect-and-build\.result == 'success'/,'A Pages failure must persist a deferred brief after collection succeeds');
 const notifier=await readFile(new URL('../scripts/notify.mjs',import.meta.url),'utf8');
 assert.match(notifier,/beforeSend:test\?undefined:item=>verifyPublishedNotification\(item\)/,'An automatic send still requires published matching prices');
 assert.match(workflow,/cron: '7 \* 10-21 10 \*'/);assert.match(workflow,/cron: '22,37,52 \* 10-21 10 \*'/);
});
