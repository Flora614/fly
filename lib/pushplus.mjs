import {config} from '../config.mjs';
import {detectChanges,shouldQuery} from './store.mjs';
import {displayBaseline,differenceFromBaseline} from './price-baseline.mjs';

export const PAGE_URL='https://flora614.github.io/fly/';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
const money=value=>typeof value==='number'?`¥${value}/人`:'官网未显示';
const signed=value=>(value>0?'+':'')+value;
const automatic=records=>records.filter(r=>r.date===config.focusDate&&r.source.kind==='automatic').sort((a,b)=>Date.parse(a.queriedAt)-Date.parse(b.queriedAt));
export function hourKey(now){return new Intl.DateTimeFormat('sv-SE',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hour12:false}).format(now);}

// A pure planner: neither reads credentials nor sends a message.
export function planNotification({records,roundId,mode='focus',now=new Date(),testId=null}){
 const history=automatic(records),current=history.filter(r=>r.roundId===roundId).at(-1);
 if(!testId&&(!current||!shouldQuery(config.focusDate,history,now)||current.status==='departed'))return null;
 const quote=(testId?history:history.filter(r=>Date.parse(r.queriedAt)<=Date.parse(current.queriedAt))).filter(r=>r.status==='success').at(-1);
 const previous=quote?history.filter(r=>Date.parse(r.queriedAt)<Date.parse(quote.queriedAt)):[];
 const changes=quote?detectChanges(previous,quote):[];
 if(!testId&&mode!=='full'&&(current.status!=='success'||!changes.length))return null;
 const stale=!!testId||current?.status!=='success';
 const low=quote&&quote.lowest<550;
 const kind=testId?'test':mode==='full'?'hourly':'change';
 const comparable=quote&&previous.some(r=>r.status==='success'&&r.source.name===quote.source.name&&r.priceScope===quote.priceScope&&r.taxBasis===quote.taxBasis);
 const changeText=changes.length?(changes.every(c=>c.metric==='zPrice')?'最低价无变动，Z舱有变动':'有变动'):comparable?'无变动':'暂无对比报价';
 const baselineDifference=differenceFromBaseline(quote,'lowest');
 const baselineTitle=baselineDifference===null?changeText:baselineDifference>0?`较截图基准涨${baselineDifference}元`:baselineDifference<0?`较截图基准降${Math.abs(baselineDifference)}元`:'较截图基准无涨跌';
 const priceTitle=quote?`${stale?'最新有效':'目前'}最低价${quote.lowest}元/人`:'暂无有效报价';
 const title=(testId?'【微信测试】':'')+(low?'【低于550元】':'')+priceTitle+'，'+(testId?'历史报价':stale?'本轮查询失败，变动未知':baselineTitle);
 const lines=[`<h2>${escapeHtml(title)}</h2>`,`<p>福州长乐 FOC → 成都天府 TFU · 2026-10-20</p>`];
 if(testId)lines.push('<p><strong>这是一条经授权的测试通知。显示已有历史报价，没有额外实时查价，也不会启用自动发送。</strong></p>');
 else if(stale)lines.push(`<p><strong>本轮查价未成功（${escapeHtml(current.status)}）。以下为最新有效历史报价，不是本轮实时价格。</strong></p>`);
 if(quote){
  if(low)lines.push(`<p style="color:#c62828;font-size:20px"><strong>低于550元/人！最低票价 ${money(quote.lowest)}${changes.some(c=>c.metric==='lowest'&&c.difference<0)?'，已降价':''}</strong></p>`);
  lines.push(`<p>最低票价：<strong>${money(quote.lowest)}</strong><br>Z舱价格：<strong>${money(quote.zPrice)}</strong><br>两人票价估算：最低 ¥${quote.lowest*2}${typeof quote.zPrice==='number'?`；Z舱 ¥${quote.zPrice*2}`:''}<br>库存：${escapeHtml(quote.inventory)}</p>`);
  lines.push(`<p>${stale?'最新有效报价时间':'查询时间'}：${time(quote.queriedAt)}（Asia/Shanghai）<br>来源：${escapeHtml(quote.source.name)}</p>`);
  const base=displayBaseline.quotes.find(r=>r.date===quote.date);
  if(base){
   lines.push(`<p><strong>固定截图基准：2026/10/10 23:19–23:21（Asia/Shanghai），不会随查询改变。</strong>${stale?'<br>以下差额对应上面标明时间的最新有效历史报价。':''}</p>`);
   for(const metric of ['lowest','zPrice']){
    const difference=differenceFromBaseline(quote,metric),label=metric==='lowest'?'最低价':'Z舱';
    lines.push(difference===null?`<p>${label}较截图基准：无法比较（价格缺失或来源、税费、时间不可比）。</p>`:`<p>${label}较截图基准：¥${base[metric]} → ¥${quote[metric]}，每人 ${signed(difference)} 元，两人合计估算 ${signed(difference*2)} 元。</p>`);
   }
  }
  if(changes.length)for(const c of changes)lines.push(`<p>${c.metric==='lowest'?'最低价':'Z舱'}变化：¥${c.old} → ¥${c.new}，每人 ${signed(c.difference)} 元，两人合计估算 ${signed(c.differenceForTwoEstimate)} 元。<br>对比报价时间：${time(c.previousAt)}</p>`);
  else lines.push(`<p>${previous.some(r=>r.status==='success'&&r.source.name===quote.source.name&&r.taxBasis===quote.taxBasis)?'与上次同来源、同税费口径有效报价相比：可比较价格未变化。缺失舱位不推断涨跌。':'暂无可比较的上次有效报价。'}</p>`);
  lines.push(`<p>税费口径：${{unknown:'官网未明确',included:'已含税费',excluded:'未含税费'}[quote.taxBasis]}。两人金额仅为票价乘2估算，未验证同时购买最终总价。</p>`);
 }else lines.push('<p>目前没有有效自动报价，无法提供价格或判断涨跌。</p>');
 lines.push(`<p>消息生成时间：${time(now)}（Asia/Shanghai）</p><p><a href="${PAGE_URL}">查看专属价格监控网页与历史记录</a></p>`);
 const publication={quote:quote?{id:quote.id,date:quote.date,queriedAt:quote.queriedAt,lowest:quote.lowest,zPrice:quote.zPrice,taxBasis:quote.taxBasis}:null,attempt:current?{id:current.id,date:current.date,queriedAt:current.queriedAt,status:current.status}:null};
 return {key:testId?`test:${testId}`:mode==='full'?`hourly:${hourKey(now)}`:`round:${roundId}`,kind,roundId:roundId||null,quoteAt:quote?.queriedAt||null,publication,payload:{title,content:lines.join('\n'),template:'html',channel:'wechat'}};
}

export async function verifyPublishedNotification(item,{fetchImpl=fetch}={}){
 try{
  if(!item.publication?.attempt)return {ready:false,error:{code:'publication_metadata_missing'}};
  const response=await fetchImpl(PAGE_URL+'data/index.json?notificationCheck='+Date.now(),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)return {ready:false,error:{code:'publication_fetch_failed'}};
  const data=await response.json();
  if(data.schemaVersion!==1||!Array.isArray(data.records))return {ready:false,error:{code:'publication_invalid_data'}};
  const matches=expected=>data.records.some(r=>r.source?.kind==='automatic'&&Object.entries(expected).every(([k,v])=>r[k]===v));
  if(!matches(item.publication.attempt)||(item.publication.quote&&!matches({...item.publication.quote,status:'success'})))return {ready:false,error:{code:'publication_not_ready'}};
  return {ready:true,generatedAt:data.generatedAt};
 }catch{return {ready:false,error:{code:'publication_fetch_failed'}};}
}

// Only sanitized codes are persisted; never API response text, tokens or raw errors.
export async function sendPushPlus(payload,token,{fetchImpl=fetch,now=new Date()}={}){
 if(!token)return {status:'retry_wait',error:{code:'missing_secret'}};
 try{
  const response=await fetchImpl('https://www.pushplus.plus/send',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)return {status:response.status>=500?'uncertain':'retry_wait',error:{code:`http_${response.status}`}};
  const result=await response.json();
  if(result.code===200&&typeof result.data==='string'&&result.data.length)return {status:'accepted',error:null};
  if(typeof result.code==='number'&&result.code!==200)return {status:'retry_wait',error:{code:`api_${result.code}`}};
  return {status:'uncertain',error:{code:'invalid_response'}};
 }catch{return {status:'uncertain',error:{code:'transport_or_response_unknown'}};}
}

export async function processNotification({state,plan,enabled,now=new Date(),token,checkpoint,fetchImpl=fetch,beforeSend=async()=>({ready:true}),sendGuard=()=>true}){
 if(!enabled)return {status:'disabled'};
 // A crash after the durable pre-send checkpoint cannot safely be auto-retried.
 for(const item of state.messages)if(item.status==='sending'){item.status='uncertain';item.error={code:'interrupted_send_unknown'};}
 let item=plan&&state.messages.find(m=>m.key===plan.key);
 if(item&&['accepted','uncertain','exhausted','superseded','stopped'].includes(item.status))return {status:'deduplicated',previousStatus:item.status};
 if(plan&&!item){
  // One logical message per round. A fresh brief incorporates the latest state.
  for(const old of state.messages)if(old.kind!=='test'&&old.status==='retry_wait'){old.status='superseded';old.supersededBy=plan.key;}
  item={...plan,status:'pending',attempts:0,createdAt:now.toISOString(),retryAt:null,error:null};state.messages.push(item);
 }
 if(!item&&!plan)item=[...state.messages].reverse().find(m=>m.kind!=='test'&&m.status==='retry_wait'&&Date.parse(m.retryAt)<=now.getTime());
 if(!item)return {status:'nothing_due'};
 if(item.status==='retry_wait'&&Date.parse(item.retryAt)>now.getTime())return {status:'retry_not_due'};
 item.attempts++;item.updatedAt=now.toISOString();item.retryAt=null;
 const publication=await beforeSend(item);
 let result;
 if(!publication.ready)result={status:'retry_wait',error:publication.error};
 else{
  if(publication.generatedAt){item.publicationVerifiedAt=new Date().toISOString();item.publishedDataGeneratedAt=publication.generatedAt;}
  item.status='sending';
  // Must succeed (including remote persistence in Actions) before any network send.
  await checkpoint(state);
  const payload=item.attempts>1?{...item.payload,title:'【重试】'+item.payload.title,content:'<p><strong>这是原通知的重试，以下为原报价及查询时间，不代表本轮实时查价。</strong></p>\n'+item.payload.content}:item.payload;
  // Recheck after the checkpoint: it may have crossed the departure boundary.
  result=sendGuard()?await sendPushPlus(payload,token,{fetchImpl,now}):{status:'stopped',error:null};
 }
 item.status=result.status;item.error=result.error;item.updatedAt=now.toISOString();
 if(item.status==='retry_wait'){
  item.status=item.attempts>=3?'exhausted':'retry_wait';
  item.retryAt=item.status==='retry_wait'?new Date(now.getTime()+15*60000*2**(item.attempts-1)).toISOString():null;
 }
 if(item.kind==='test'&&item.status==='accepted')state.lastTestAcceptedAt=now.toISOString();
 await checkpoint(state);
 return {status:item.status,kind:item.kind,attempts:item.attempts,error:item.error};
}
