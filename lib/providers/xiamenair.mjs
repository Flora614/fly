import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {config,queryUrl} from '../../config.mjs';
// Provider contract: init(), query(date)->observation, close(). No purchase path.
export class XiamenAirProvider{
 async init(){
  this.browser=await chromium.launch({headless:process.env.HEADED!=='1',...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{}),...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  this.context=await this.browser.newContext({locale:'zh-CN',timezoneId:config.timezone,viewport:{width:1280,height:1000}});
 }
 async query(date){
  const r={date,flight:config.flight,origin:'FOC',destination:'TFU',queriedAt:new Date().toISOString(),status:'failed',lowest:null,zPrice:null,departureAt:null,arrivalTime:null,inventory:'unknown',cabins:[],source:{name:'厦航官网',url:queryUrl(date),kind:'automatic'},priceScope:config.priceScope,currency:'CNY',taxBasis:'unknown',taxPerAdult:null,partyPriceVerified:false,requestedAdults:2,error:null};
  const page=await this.context.newPage();page.setDefaultTimeout(20000);
  const evidenceDir=process.env.SAVE_EVIDENCE==='0'?null:'evidence/'+r.queriedAt.replaceAll(':','-')+'-'+date;
  if(evidenceDir)await mkdir(evidenceDir,{recursive:true});
  async function guard(){
   const text=await page.locator('body').innerText();
   if(/ecipuia\.xiamenair\.com/.test(page.url())||/请输入白鹭卡号/.test(text))throw Object.assign(Error('官网要求登录'),{code:'login_required'});
   if(/验证码|人机验证|请完成.*验证|滑动.*验证|访问过于频繁|访问受限/.test(text))throw Object.assign(Error('官网验证或访问限制'),{code:'access_restricted'});
   if(await page.locator('iframe[src*="captcha"],iframe[src*="recaptcha"]').count())throw Object.assign(Error('官网验证控件'),{code:'access_restricted'});
  }
  try{
   await page.goto(queryUrl(date),{waitUntil:'domcontentloaded',timeout:45000});await guard();
   const flight=page.locator('.list-group').filter({has:page.locator('.flight-num',{hasText:config.flight})});
   try{await flight.waitFor({state:'visible',timeout:45000});}catch(e){await guard();if(await page.locator('.list-group').count()){r.status='not_found';throw Object.assign(Error('航班列表未显示MF8455，不推断为售罄'),{code:'flight_not_found'});}throw e;}
   if(await flight.count()!==1)throw Error('目标航班匹配不唯一');
   if(await page.getByPlaceholder('去程日期').inputValue()!==date||await page.getByPlaceholder('出发城市').inputValue()!=='福州'||await page.getByPlaceholder('到达城市').inputValue()!=='成都天府')throw Error('官网查询条件不匹配');
   const dt=(await flight.locator('.start .time').innerText()).trim();
   if(!/^\d{2}:\d{2}$/.test(dt))throw Error('起飞时间格式异常');
   r.departureAt=date+'T'+dt+':00+08:00';r.arrivalTime=(await flight.locator('.end .time').innerText()).trim();
   if(Date.now()>=Date.parse(r.departureAt)){r.status='departed';return r;}
   await flight.locator('.price-list .price-item').first().click();
   await flight.locator('.cabin-item .site').first().waitFor({state:'visible'});await guard();
   const more=flight.locator('.bottom .up');
   if(await more.count() && (await more.innerText()).includes('更多')){
    const beforeCount=await flight.locator('.cabin-item .site').count();
    await more.click();
    await page.waitForFunction(count=>{const e=[...document.querySelectorAll('.list-group')].find(e=>e.querySelector('.flight-num')?.textContent.includes('MF8455'));return e&&(e.querySelectorAll('.cabin-item .site').length>count||e.querySelector('.bottom .down'));},beforeCount,{timeout:10000});
   }
   const cabins=await flight.locator(':scope > div > .cabin-item').evaluateAll(items=>items.map(item=>({code:item.querySelector('.site span')?.textContent?.replace(/[()\s]/g,''),price:Number(item.querySelector('.item > .price strong')?.textContent),inventory:item.querySelector('.item > .remark')?.textContent?.trim()||'未显示库存'})).filter(i=>i.code&&Number.isFinite(i.price)&&i.price>0));
   if(!cabins.length)throw Error('未解析到舱位列表，不推断为售罄');
   const lowest=Number(await flight.locator('.price-list strong').first().innerText());
   if(!Number.isFinite(lowest)||lowest<=0)throw Error('最低价格式异常');
   r.lowest=lowest;r.cabins=cabins;const z=cabins.find(c=>c.code==='Z');
   r.zPrice=z?.price??null;r.inventory=z?.inventory||'未展示Z舱，不推断为售罄';r.queriedAt=new Date().toISOString();r.status='success';
  }catch(e){r.error={code:e.code||'page_error',message:e.message,at:new Date().toISOString()};r.lowest=null;r.zPrice=null;r.cabins=[];}
  finally{
   if(evidenceDir){
    await writeFile(evidenceDir+'/page.txt',await page.locator('body').innerText().catch(()=>''),'utf8');
    await page.screenshot({path:evidenceDir+'/page.png',fullPage:true,timeout:8000}).catch(e=>{r.evidenceWarning=e.message.split('\n')[0];});
    await writeFile(evidenceDir+'/observation.json',JSON.stringify(r,null,2));
   }
   await page.close();
  }return r;
 }
 async close(){await this.browser?.close();}
}
