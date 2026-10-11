import test from 'node:test';
import assert from 'node:assert/strict';
import {planNotification} from '../lib/pushplus.mjs';
import {displayBaseline,differenceFromBaseline} from '../lib/price-baseline.mjs';
const quote=(price,roundId,queriedAt,status='success')=>({id:roundId,roundId,date:'2026-10-20',flight:'MF8455',origin:'FOC',destination:'TFU',queriedAt,status,lowest:price,zPrice:price,departureAt:'2026-10-20T16:35:00+08:00',inventory:'余票充足',source:{name:'厦航官网',url:'https://www.xiamenair.com/zh-cn/',kind:'automatic'},priceScope:'official_display_per_adult',currency:'CNY',taxBasis:'unknown',partyPriceVerified:false});
const initial=quote(600,'base','2026-10-10T15:19:40.375Z');
const make=(price,roundId='latest',status='success')=>quote(price,roundId,'2026-10-11T02:15:00Z',status);
const plan=records=>planNotification({records,roundId:'latest',mode:'full',now:new Date('2026-10-11T02:30:00Z')});
test('the exact twelve screenshot prices stay immutable across subsequent queries',()=>{
 assert.deepEqual(displayBaseline.quotes.map(q=>[q.lowest,q.zPrice]),[[2100,null],[880,null],[800,null],[850,null],[454,454],[549,null],[650,null],[600,600],[650,null],[550,550],[600,600],[550,550]]);
 const before=JSON.stringify(displayBaseline);
 for(const price of [650,650,620,550,600])assert.equal(differenceFromBaseline(make(price),'lowest'),price-600);
 assert.equal(JSON.stringify(displayBaseline),before);
 assert.equal(Object.isFrozen(displayBaseline),true);
 assert.equal(Object.isFrozen(displayBaseline.quotes),true);
 assert.ok(displayBaseline.quotes.every(Object.isFrozen));
});
test('latest hourly brief retains the screenshot rise after repeated unchanged prices',()=>{
 const records=[initial,quote(650,'raised','2026-10-11T02:00:00Z'),make(650)];
 const p=plan(records);
 assert.match(p.payload.title,/较截图基准涨50元/);
 assert.match(p.payload.content,/固定截图基准/);
 assert.match(p.payload.content,/最低价较截图基准：¥600 → ¥650，每人 \+50 元，两人合计估算 \+100 元/);
 assert.match(p.payload.content,/Z舱较截图基准：¥600 → ¥650/);
 assert.match(p.payload.content,/价格未变化/);
 assert.equal(planNotification({records,roundId:'latest',mode:'focus',now:new Date('2026-10-11T02:30:00Z')}),null);
});
test('later movement compares cumulative difference with 600 rather than the preceding 650',()=>{
 const p=plan([initial,quote(650,'raised','2026-10-11T02:00:00Z'),make(620)]);
 assert.match(p.payload.title,/较截图基准涨20元/);
 assert.match(p.payload.content,/最低价较截图基准：¥600 → ¥620，每人 \+20 元/);
 assert.match(p.payload.content,/¥650 → ¥620/);
 const down=plan([initial,make(550)]);assert.match(down.payload.title,/较截图基准降50元/);
 const same=plan([initial,make(600)]);assert.match(same.payload.title,/较截图基准无涨跌/);
});
test('failed hourly query labels the old valid baseline comparison and cannot create a change alert',()=>{
 const records=[initial,quote(650,'raised','2026-10-11T02:00:00Z'),make(null,'latest','failed')];
 const p=plan(records);assert.match(p.payload.title,/本轮查询失败，变动未知/);
 assert.match(p.payload.content,/不是本轮实时价格/);
 assert.match(p.payload.content,/最低价较截图基准：¥600 → ¥650/);
 assert.equal(planNotification({records,roundId:'latest',mode:'focus',now:new Date('2026-10-11T02:30:00Z')}),null);
});
