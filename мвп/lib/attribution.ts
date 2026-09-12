import type {Workspace,Mode,Options,Allocation,Placement} from './types';
import {normalizeWorkspace,paymentRefund} from './funnel-data';
const DAY=86400000;
export const HISTORICAL_WARNING='В историческом датасете неизвестно, видел ли покупатель конкретную публикацию. Модель ниже распределяет оплату между совместимыми постами по выбранному правилу и НЕ устанавливает фактический источник покупателя.';
export function millis(value:string,offset=0):number{
 const zoned=/([zZ]|[+-]\d\d:\d\d)$/.test(value);
 return Date.parse(zoned?value:value+'Z')-(zoned?0:offset*3600000);
}
export function historicalCandidates(data:Workspace,course:string,when:number,opt:Options){
 return data.placements.filter(p=>p.mode==='historical'&&p.status==='published'&&p.courses.includes(course)&&['explicit',...(opt.family?['family_candidate']:[])].includes(p.match)&&when>=millis(p.startsAt)&&(when-millis(p.startsAt))/DAY<=opt.windowDays);
}
export function attribute(input:Workspace,mode:Mode,opt:Options):Allocation[]{
 if(!Number.isFinite(opt.windowDays)||opt.windowDays<=0||!Number.isFinite(opt.halfLifeDays)||opt.halfLifeDays<=0)throw new Error('Окно и полураспад должны быть положительными.');
 const data=normalizeWorkspace(input),places=data.placements.filter(p=>p.mode===mode&&(mode==='historical'?p.status==='published':p.status!=='cancelled')),byId=new Map(places.map(p=>[p.id,p]));
 const output:Allocation[]=[];
 for(const pay of data.payments.filter(p=>p.mode===mode&&(p.status==='paid'||p.status==='refunded'))){
  const when=millis(pay.at,mode==='historical'?opt.paymentOffset:0);if(opt.asOf&&when>millis(opt.asOf))continue;
  const refunded=paymentRefund(pay),net=pay.amount-refunded;
  const candidates:{p:Placement;at:number;relevance:number;reason:string;declared:boolean}[]=[];
  if(mode==='historical'){
   for(const p of historicalCandidates(data,pay.course,when,opt)){
    const at=millis(p.startsAt),age=(when-at)/DAY;
    candidates.push({p,at,relevance:p.match==='explicit'?1:.5,declared:false,reason:(p.match==='explicit'?'Курс явно указан в посте':'Гипотеза по линейке: низкая уверенность')+'; '+age.toFixed(2)+' дн. до оплаты. Сценарная оценка; контакт покупателя с постом неизвестен.'});
   }
  }else if(pay.userKey){
   for(const e of data.botEvents??[]){
    if(e.mode!==mode||e.userKey!==pay.userKey||e.eventType!=='start'||!e.placementId||e.mappingStatus!=='mapped')continue;
    const p=byId.get(e.placementId),at=millis(e.occurredAt),age=(when-at)/DAY;
    if(!p||age<0||age>opt.windowDays||(p.courses.length>0&&!p.courses.includes(pay.course)))continue;
    candidates.push({p,at,relevance:1,declared:false,reason:'Наблюдаемый bot start с точным источником размещения; '+age.toFixed(2)+' дн. до оплаты. Правило распределения, не причинный эффект.'});
   }
   for(const e of data.events.filter(e=>e.mode===mode&&e.type==='manager_source'&&e.placementId&&(e.botUserKey===pay.userKey||e.userId===pay.userId))){
    const p=byId.get(e.placementId!),at=millis(e.at),age=(when-at)/DAY;if(!p||age<0||age>opt.windowDays||(p.courses.length&&!p.courses.includes(pay.course)))continue;
    candidates.push({p,at,relevance:1,declared:true,reason:'Источник явно заявлен менеджером; контакт не наблюдался системой. '+age.toFixed(2)+' дн. до оплаты.'});
   }
  }
  // Repeated starts collapse only inside the same placement. Campaign/channel grouping comes later.
  const unique=new Map<string,(typeof candidates)[number]>();
  for(const c of candidates){const old=unique.get(c.p.id);if(!old||(opt.model==='first'?c.at<old.at:c.at>old.at)||(c.at===old.at&&old.declared&&!c.declared))unique.set(c.p.id,c);}
  let winners=[...unique.values()].sort((a,b)=>a.at-b.at||a.p.id.localeCompare(b.p.id));
  if(opt.model==='first')winners=winners.slice(0,1);if(opt.model==='last')winners=winners.slice(-1);
  if(!winners.length){output.push({paymentId:pay.id,userId:pay.userId,userKey:pay.userKey??null,course:pay.course,paymentAt:pay.at,amount:pay.amount,campaignId:'unknown',channel:'Источник неизвестен',placementId:null,weight:1,revenue:net,grossRevenue:pay.amount,refunds:refunded,reason:mode==='historical'?'Нет совместимой публикации в окне. Фактический источник покупателя неизвестен.':'Нет подходящего bot start с подтверждённым userKey и источником в окне. Источник неизвестен.',basis:'unknown',touchAt:null});continue;}
  const raw=(c:typeof winners[number])=>['first','last'].includes(opt.model)?1:c.relevance*(opt.model==='decay'?Math.pow(.5,(when-c.at)/DAY/opt.halfLifeDays):1);
  const total=winners.reduce((s,c)=>s+raw(c),0);
  for(const c of winners){const weight=raw(c)/total;output.push({paymentId:pay.id,userId:pay.userId,userKey:pay.userKey??null,course:pay.course,paymentAt:pay.at,amount:pay.amount,campaignId:c.p.campaignId,channel:c.p.channel,placementId:c.p.id,weight,revenue:net*weight,grossRevenue:pay.amount*weight,refunds:refunded*weight,reason:c.reason,basis:mode==='historical'?'estimate':c.declared?'declared':mode==='demo'?'synthetic':'tracked',touchAt:new Date(c.at).toISOString()});}
 }
 return output;
}
export function csv(rows:Record<string,unknown>[]):string{
 if(!rows.length)return '';
 const fields=Array.from(new Set(rows.flatMap(r=>Object.keys(r))));
 function cell(v:unknown){let s=typeof v==='object'?JSON.stringify(v):typeof v==='string'?v:typeof v==='number'||typeof v==='boolean'?String(v):'';if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
 return '\uFEFF'+[fields.map(cell).join(','),...rows.map(r=>fields.map(f=>cell(r[f])).join(','))].join('\r\n');
}
