export const config = Object.freeze({
  flight:'MF8455', origin:'FOC', destination:'TFU', timezone:'Asia/Shanghai',
  startDate:'2026-10-10', endDate:'2026-10-21', focusDate:'2026-10-20', adults:2,
  focusDeparture:'2026-10-20T16:35:00+08:00', priceScope:'official_display_per_adult'
});
export const dates=Array.from({length:12},(_,i)=>'2026-10-'+String(i+10).padStart(2,'0'));
export function shanghaiDate(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:config.timezone}).format(now);}
export function queryUrl(date){
 const p=new URLSearchParams({tripType:'OW','orgCodeArr[0]':'FOC','dstCodeArr[0]':'TFU','orgDateArr[0]':date,dstDate:'',isInter:'false',adtNum:'2',chdNum:'0',infNum:'0',JFCabinFirst:'false',acntCd:'',mode:'Money',partner:'false',jcgm:'false',paxType:'',isPet:'false',petType:'noseat'});
 return 'https://www.xiamenair.com/zh-cn/nticket.html?'+p;
}