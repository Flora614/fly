import Chart from 'chart.js/auto';
import {differenceFromBaseline} from './price-baseline';
import './style.css';
type Change={metric:'lowest'|'zPrice';old:number;new:number;difference:number;differenceForTwoEstimate:number;previousAt:string};
type Entry={id:string;date:string;queriedAt:string;status:'success'|'failed'|'departed'|'not_found';lowest:number|null;zPrice:number|null;inventory:string;departureAt:string|null;taxBasis:string;priceScope:string;source:{name:string;url:string;kind:string;note?:string};changes:Change[];error?:{message:string}};
type Data={schemaVersion:number;config:{focusDate:string;focusDeparture:string};dates:string[];generatedAt:string;records:Entry[];lastScheduledRunAt?:string|null};
const app=document.querySelector<HTMLDivElement>('#app')!;
let data:Data,selected='2026-10-20',source='automatic',before='',chart:Chart|undefined;
const money=(n:number|null|undefined)=>typeof n==='number'?'¥'+n.toLocaleString('zh-CN'):'—';
const time=(s:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
const weekday=(s:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',weekday:'short'}).format(new Date(s+'T12:00:00+08:00'));
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const labels={success:'查询成功',failed:'查询失败',departed:'已过起飞时间',not_found:'未显示此航班'};
function rows(date?:string){return data.records.filter(r=>(!date||r.date===date)&&r.source.kind===source&&(!before||Date.parse(r.queriedAt)<=Date.parse(before))).sort((a,b)=>Date.parse(a.queriedAt)-Date.parse(b.queriedAt));}
function last(date:string,success=false){return rows(date).filter(r=>!success||r.status==='success').at(-1);}
function delta(r:Entry|undefined,metric:'lowest'|'zPrice'){const c=r?.changes.find(c=>c.metric===metric);return !c?'<span class="muted">—</span>':'<span class="'+(c.difference<0?'down':'up')+'">'+(c.difference>0?'+':'−')+'¥'+Math.abs(c.difference)+'</span>';}
function baselineDelta(r:Entry|undefined,metric:'lowest'|'zPrice'){
 const n=differenceFromBaseline(r,metric);
 if(n===null)return '<span class="muted">—</span>';
 if(n===0)return '<span class="muted">¥0</span>';
 return '<span class="'+(n<0?'down':'up')+'">'+(n>0?'+':'−')+'¥'+Math.abs(n)+'</span>';
}
function render(){
 chart?.destroy();
 const f=last(data.config.focusDate,true),attempt=last(data.config.focusDate),now=before?Date.parse(before):Date.now(),price=f?.zPrice;
 const ended=now>=Date.parse(f?.departureAt||data.config.focusDeparture),stale=f&&now-Date.parse(f.queriedAt)>35*60000;
 const changeRecord=rows(data.config.focusDate).filter(r=>r.status==='success'&&r.changes.some(c=>c.metric==='zPrice')).at(-1);
 const c=changeRecord?.changes.find(c=>c.metric==='zPrice'),valid=rows().filter(r=>r.status==='success').at(-1);
 const badge=before?'历史快照':ended?'已过起飞时间':attempt&&attempt.status!=='success'?labels[attempt.status]:f?stale?'记录待更新':'最近成功报价':'等待报价';
 app.innerHTML=`<main><header><a class="brand" href="./"><span class="brand-mark">↗</span>去成都</a><span class="tag">MF8455</span></header>
 <section class="intro"><p class="eyebrow">一段旅程，从好价格开始</p><h1>福州 <span class="arrow">→</span> 成都</h1><p class="route">长乐 FOC <span>直飞</span> 天府 TFU</p></section>
 <section class="hero card"><div class="between"><div><p class="eyebrow blue">重点关注</p><h2>10 月 20 日 <span>星期二</span></h2></div><span class="pill">${badge}</span></div>
 <div class="hero-price"><span>${money(price)}</span><small>/ 人</small></div><p class="fare-label">经济舱 Z 舱 · 官网展示票价</p>
 <div class="hero-grid"><div><span>两人票价估算</span><strong>${money(typeof price==='number'?price*2:null)}</strong></div><div><span>上次 Z 舱变化</span><strong>${delta(changeRecord,'zPrice')}</strong></div><div><span>Z 舱库存</span><strong class="inventory">${esc(f?.inventory||'未查询')}</strong></div></div>
 ${c?`<p class="change-line">${money(c.old)} → ${money(c.new)}，两人估算差额 ${c.differenceForTwoEstimate>0?'+':'−'}¥${Math.abs(c.differenceForTwoEstimate)} · 对比 ${time(c.previousAt)}</p>`:''}
 ${typeof price==='number'&&price<550?'<p class="deal">低于 ¥550 / 人，值得留意这个价格。</p>':''}
 <p class="footnote">仅记录官网公开展示价格；两人合计为乘 2 估算，未验证同价购买。${f?.taxBasis==='included'?'来源标注含税。':f?.taxBasis==='excluded'?'来源标注不含税，税费另计。':'官网此页未明确税费口径，最终总价未确认。'}</p>
 <div class="source-line"><span>${f?`成功于 ${time(f.queriedAt)} · ${esc(f.source.name)}${f.source.kind==='manual'?' · 手动导入':''}`:'尚无成功记录'}</span>${f?`<a href="${esc(f.source.url)}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a>`:''}</div>
 ${attempt&&attempt.status!=='success'?`<p class="error-note">${labels[attempt.status]} · ${time(attempt.queriedAt)}：${esc(attempt.error?.message||'')}。以上价格为最近成功记录，不代表本轮实时价格。</p>`:''}</section>
 <div class="controls"><label>数据来源<select id="source"><option value="automatic" ${source==='automatic'?'selected':''}>官网自动查询</option><option value="manual" ${source==='manual'?'selected':''}>Work 手动导入</option></select></label><label>查看时间<select id="snapshot"><option value="">最近记录</option>${[...new Set(data.records.map(r=>r.queriedAt))].sort().reverse().map(t=>`<option value="${esc(t)}" ${before===t?'selected':''}>${time(t)}</option>`).join('')}</select></label></div>
 ${before?'<p class="history-banner">正在查看过去的快照，价格截至所选时间。</p>':''}
 <section class="card dates-card"><div class="section-heading"><div><p class="eyebrow">灵活一点，好价多一点</p><h2>逐日票价</h2></div><span class="muted">10.10 — 10.21</span></div><p class="table-note">每人 / 元 · 固定对比 10/10 截图价格（23:19–23:21）；— 表示无法比较</p><div class="table-wrap"><table><thead><tr><th>出发日期</th><th>最低价</th><th>Z 舱</th><th>较基准<br><small>最低 / Z</small></th></tr></thead><tbody>${data.dates.map(d=>{
 const r=last(d,true),a=last(d),past=now>=Date.parse(r?.departureAt||d+'T23:59:59+08:00'),old=r&&now-Date.parse(r.queriedAt)>(d===data.config.focusDate?35:90)*60000;
 const state=before?'历史快照':past?'已过起飞时间':a?.status==='failed'?'查询失败 · 保留旧记录':a?.status==='not_found'?'未显示航班':r?old?'记录待更新':time(r.queriedAt):'未查询';
 return `<tr class="${d===data.config.focusDate?'focus-row':''} ${d===selected?'selected':''}"><td><button class="date-button" data-date="${d}" aria-pressed="${d===selected}"><b>${d.slice(5).replace('-','.')}</b><span>${weekday(d)}${d===data.config.focusDate?' · 关注':''}</span></button><small class="row-status">${state}</small></td><td>${money(r?.lowest)}</td><td>${money(r?.zPrice)}</td><td>${baselineDelta(r,'lowest')} / ${baselineDelta(r,'zPrice')}</td></tr>`;
 }).join('')}</tbody></table></div></section>
 <section class="card chart-card"><div class="section-heading"><div><p class="eyebrow">每一次查价，都留个记录</p><h2>${selected.slice(5).replace('-',' 月 ')} 日价格走势</h2></div><select id="date-select" aria-label="历史走势日期">${data.dates.map(d=>`<option value="${d}" ${d===selected?'selected':''}>${d.slice(5)} ${weekday(d)}</option>`).join('')}</select></div><div class="chart-wrap"><canvas id="chart" role="img" aria-label="最低价和Z舱历史折线图"></canvas></div><p id="chart-note" class="footnote"></p></section>
 <section class="card log-card"><div class="section-heading"><h2>查询记录</h2><span class="muted">${selected}</span></div>${rows(selected).slice().reverse().slice(0,40).map(r=>`<details><summary><span class="log-dot ${r.status}"></span><span>${time(r.queriedAt)}</span><b>${labels[r.status]}</b><span>${r.status==='success'?money(r.zPrice):'—'}</span></summary><p>${esc(r.source.name)} · ${r.source.kind==='manual'?'手动导入':'自动查询'} · ${esc(r.inventory)}</p><p>最低价 ${money(r.lowest)} / Z 舱 ${money(r.zPrice)} · 税费 ${r.taxBasis==='unknown'?'未确认':r.taxBasis==='included'?'含税':'不含税'}</p>${r.error?`<p class="error-note">${esc(r.error.message)}</p>`:''}${r.source.note?`<p>${esc(r.source.note)}</p>`:''}<a href="${esc(r.source.url)}" target="_blank" rel="noopener noreferrer">原始查询来源 ↗</a></details>`).join('')||'<p class="empty">还没有这个日期的记录。失败记录也会如实保留。</p>'}</section>
 <footer><p>时间统一为北京时间 · Asia/Shanghai</p><p>${valid?`最近成功查询 ${time(valid.queriedAt)} · ${esc(valid.source.name)}`:'暂无成功查询'}<br>页面数据生成 ${time(data.generatedAt)}</p><p>计划频率：全日期每小时，20 日每 15 分钟。调度可能延迟。<br>${data.lastScheduledRunAt?'最近自动调度 '+time(data.lastScheduledRunAt):'云端定时执行尚无运行记录'} · <a href="https://github.com/Flora614/fly/actions" target="_blank" rel="noopener noreferrer">查看运行状态</a><br>历史记录保留；微信通知由独立开关控制，状态见 Actions。不会自动购票。</p><button id="refresh" class="refresh">刷新已保存记录 ↻</button><a class="download" href="./data/index.json" download>下载历史 JSON</a></footer></main>`;
 document.querySelector<HTMLSelectElement>('#source')!.onchange=e=>{source=(e.target as HTMLSelectElement).value;render();};
 document.querySelector<HTMLSelectElement>('#snapshot')!.onchange=e=>{before=(e.target as HTMLSelectElement).value;render();};
 document.querySelector<HTMLSelectElement>('#date-select')!.onchange=e=>{selected=(e.target as HTMLSelectElement).value;render();};
 document.querySelectorAll<HTMLButtonElement>('[data-date]').forEach(b=>b.onclick=()=>{selected=b.dataset.date!;render();document.querySelector('.chart-card')?.scrollIntoView({behavior:'smooth',block:'start'});});
 document.querySelector<HTMLButtonElement>('#refresh')!.onclick=()=>void load();draw();
}
function draw(){
 const r=rows(selected),success=r.filter(r=>r.status==='success');
 document.querySelector('#chart-note')!.textContent=success.length===0?'暂无成功报价，不补齐缺失价格。':success.length===1?'当前只有一次成功查询，图中显示一个点；后续查询会形成走势。':'圆点为实际成功报价；查询失败处断开，不插值。点选圆点可查看查询时间。';
 chart=new Chart(document.querySelector<HTMLCanvasElement>('#chart')!,{type:'line',data:{labels:r.map(r=>time(r.queriedAt)),datasets:[
 {label:'Z 舱',data:r.map(r=>r.status==='success'?r.zPrice:null),borderColor:'#007aff',backgroundColor:'#007aff',borderWidth:2.5,pointRadius:4,tension:0,spanGaps:false},
 {label:'最低价',data:r.map(r=>r.status==='success'?r.lowest:null),borderColor:'#72bca5',backgroundColor:'#72bca5',borderWidth:2,pointRadius:3,borderDash:[5,4],tension:0,spanGaps:false}
 ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8,padding:20}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:4}},y:{ticks:{callback:v=>'¥'+v},grid:{color:'#f0f1f3'}}}}});
}
async function load(){try{
 const response=await fetch('./data/index.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
 const next=await response.json() as Data;if(next.schemaVersion!==1||!Array.isArray(next.records))throw Error('数据格式异常');data=next;render();
}catch(e){const msg=e instanceof Error?e.message:String(e);if(!data)app.innerHTML='<main><section class="card"><h1>暂时读不到记录</h1><p>'+esc(msg)+'</p><p>未显示价格，不代表涨价或售罄。</p><button onclick="location.reload()">重新读取</button></section></main>';else{const p=document.createElement('p');p.className='error-note';p.textContent='刷新失败：'+msg+'，页面保留原记录。';app.prepend(p);}}}
void load();
