import type {Workspace,Mode,Options,Allocation,Placement} from './types';
const DAY=86400000;
export function millis(value:string,offset=0):number{
 const zoned=/([zZ]|[+-]\d\d:\d\d)$/.test(value);
 return Date.parse(zoned?value:value+'Z')-(zoned?0:offset*3600000);
}
export function attribute(data:Workspace,mode:Mode,opt:Options):Allocation[]{
 const places=data.placements.filter(p=>p.mode===mode&&p.status==='published');
 const byId=new Map(places.map(p=>[p.id,p]));
 const output:Allocation[]=[];
 for(const pay of data.payments.filter(p=>p.mode===mode&&(p.status==='paid'||p.status==='refunded'))){
  const when=millis(pay.at,mode==='historical'?opt.paymentOffset:0);
  if(opt.asOf&&when>millis(opt.asOf))continue;
  const refunded=pay.status==='refunded'?pay.amount:Math.min(pay.amount,Math.max(0,pay.refundAmount??0)),net=pay.amount-refunded;
  const candidates:{p:Placement;at:number;raw:number;reason:string}[]=[];
  if(mode==='historical'){
   for(const p of places){
    const at=millis(p.startsAt),age=(when-at)/DAY;
    if(age<0||age>opt.windowDays||!p.courses.includes(pay.course))continue;
    if(p.match!=='explicit'&&!(opt.family&&p.match==='family_candidate'))continue;
    const relevance=p.match==='explicit'?1:0.5;
    candidates.push({p,at,raw:relevance*Math.pow(0.5,age/opt.halfLifeDays),reason:(p.match==='explicit'?'Курс явно указан в посте':'Предположение по линейке, коэффициент 0,5')+'; '+age.toFixed(2)+' дн. до оплаты. Это временное соответствие, контакт покупателя неизвестен.'});
   }
  }else{
   for(const e of data.events){
    if(e.mode!==mode||e.userId!==pay.userId||!['visit','start_bot','manager_source'].includes(e.type)||!e.placementId)continue;
    const p=byId.get(e.placementId),at=millis(e.at),age=(when-at)/DAY;
    if(!p||age<0||age>opt.windowDays||(p.courses.length>0&&!p.courses.includes(pay.course)))continue;
    candidates.push({p,at,raw:Math.pow(0.5,age/opt.halfLifeDays),reason:(e.type==='manager_source'?'Источник зафиксирован менеджером со слов клиента; ':e.type==='visit'?'Переход по уникальной ссылке браузером, связанным с этой заявкой; ':'Подтверждённый вход с идентификатором размещения; ')+age.toFixed(2)+' дн. до оплаты. Правило распределения, не причинный эффект.'});
   }
  }
  // Reposts and repeat starts do not multiply a campaign's credit.
  const grouped=new Map<string,(typeof candidates)[number]>();
  for(const c of candidates){
   const old=grouped.get(c.p.campaignId);
   if(!old||(opt.model==='first'?c.at<old.at:c.at>old.at)|| (c.at===old.at&&c.raw>old.raw))grouped.set(c.p.campaignId,c);
  }
  let winners=Array.from(grouped.values()).sort((a,b)=>a.at-b.at||a.p.id.localeCompare(b.p.id));
  if(opt.model==='first')winners=winners.slice(0,1);
  if(opt.model==='last')winners=winners.slice(-1);
  if(!winners.length){
   output.push({paymentId:pay.id,userId:pay.userId,course:pay.course,paymentAt:pay.at,amount:pay.amount,campaignId:'unknown',placementId:null,weight:1,revenue:net,grossRevenue:pay.amount,refunds:refunded,reason:mode==='historical'?'Нет совместимой публикации в выбранном окне; источник неизвестен.':'Нет перехода по уникальной ссылке этой заявки в окне; источник неизвестен.',basis:'unknown',touchAt:null});
   continue;
  }
  const total=winners.reduce((s,c)=>s+(opt.model==='decay'?c.raw:1),0);
  for(const c of winners){
   const weight=(opt.model==='decay'?c.raw:1)/total;
   output.push({paymentId:pay.id,userId:pay.userId,course:pay.course,paymentAt:pay.at,amount:pay.amount,campaignId:c.p.campaignId,placementId:c.p.id,weight,revenue:net*weight,grossRevenue:pay.amount*weight,refunds:refunded*weight,reason:c.reason,basis:mode==='historical'?'estimate':mode==='demo'?'synthetic':c.reason.startsWith('Источник зафиксирован')?'declared':'tracked',touchAt:new Date(c.at).toISOString()});
  }
 }
 return output;
}
export function csv(rows:Record<string,unknown>[]):string{
 if(!rows.length)return '';
 const fields=Array.from(new Set(rows.flatMap(r=>Object.keys(r))));
 function cell(v:unknown){let s=typeof v==='object'?JSON.stringify(v):String(v??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
 return '\uFEFF'+[fields.map(cell).join(','),...rows.map(r=>fields.map(f=>cell(r[f])).join(','))].join('\r\n');
}
