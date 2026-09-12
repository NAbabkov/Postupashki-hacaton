import type {BotEvent,Payment,PurchaseIntent,ReportScope,Workspace} from './types';
import {normalizeWorkspace,paymentRefund} from './funnel-data';
import {has,millis,selectedPlacement,NONE} from './reporting';
export type FunnelBy='placement'|'campaign'|'channel'|'course';
export interface PaymentRow {payment:Payment;intent:PurchaseIntent|null;placementId:string|null;net:number;refund:number;}
export interface FunnelGroup {
 key:string;name:string;detail:string;placementIds:string[];campaignIds:string[];channels:string[];courses:string[];
 webClicks:number;uniqueBrowsers:number;botStartsRaw:number;botStartsUsers:number;intentsRaw:number;intentUsers:number;paidUsers:number;paymentsCount:number;netRevenue:number;
 startToIntentPct:number|null;intentToPaidPct:number|null;mappingStatus:'tracked'|'organic'|'unmapped'|'unknown'|'no_payments';userKeys:string[];botEvents:BotEvent[];
}
const ratio=(n:number,d:number)=>d?n/d*100:null;
export function funnelReport(input:Workspace,scope:ReportScope,by:FunnelBy='placement'){
 const data=normalizeWorkspace(input),mode=scope.mode==='all'?'demo':scope.mode,until=scope.asOf+'T23:59:59.999Z';
 const places=data.placements.filter(p=>selectedPlacement(p,{...scope,mode})&&(scope.courses===null||p.courses.some(c=>has(c,scope.courses))||!p.courses.length&&has(NONE,scope.courses)));
 const ids=new Set(places.map(p=>p.id)),pmap=new Map(data.placements.map(p=>[p.id,p])),cmap=new Map((data.campaigns??[]).map(c=>[c.id,c]));
 const unknownAllowed=scope.channels===null&&scope.campaigns===null&&(scope.placements??null)===null;
 const inDates=(at:string)=>at>=scope.from+'T00:00:00Z'&&at<=scope.to+'T23:59:59.999Z';
 const bots=(data.botEvents??[]).filter(e=>e.mode===mode&&e.occurredAt<=until&&(e.placementId?ids.has(e.placementId):unknownAllowed&&has(NONE,scope.courses)&&inDates(e.occurredAt)));
 const intents=(data.purchaseIntents??[]).filter(i=>i.mode===mode&&i.occurredAt<=until&&(i.placementId?ids.has(i.placementId):unknownAllowed&&has(NONE,scope.courses)&&inDates(i.occurredAt)));
 const intentMap=new Map((data.purchaseIntents??[]).map(i=>[i.id,i]));
 const payments:PaymentRow[]=data.payments.filter(p=>p.mode===mode&&millis(p.at)<=millis(until)&&has(p.course,scope.courses)).flatMap(payment=>{
  const intent=payment.purchaseIntentId?intentMap.get(payment.purchaseIntentId)??null:null;
  if(intent?.placementId?!ids.has(intent.placementId):!unknownAllowed||!inDates(payment.at))return [];
  return [{payment,intent,placementId:intent?.placementId??null,net:payment.amount-paymentRefund(payment),refund:paymentRefund(payment)}];
 });
 const webs=data.events.filter(e=>e.mode===mode&&['visit','web_visit','click'].includes(e.type)&&e.at<=until&&e.placementId&&ids.has(e.placementId));
 type Acc={group:FunnelGroup;browsers:Set<string>;starts:Set<string>;intents:Set<string>;paid:Set<string>;};
 const acc=new Map<string,Acc>();
 function get(placementId:string|null,source:string|null=null,course:string|null=null){
  const p=placementId?pmap.get(placementId):null;
  const type=p?'tracked':source?'unmapped':'organic';
  const product=course??(p?.courses.length===1?p.courses[0]:NONE);
  const key=p?(by==='placement'?p.id:by==='campaign'?p.campaignId:by==='channel'?p.channel:product):source?'unmapped:'+source:'unknown';
  let a=acc.get(key);if(!a){const name=p?(by==='placement'?p.title:by==='campaign'?cmap.get(p.campaignId)?.name??p.campaignId:by==='channel'?p.channel:product):source?'Неизвестный ключ источника':'Источник неизвестен / органический';
   a={group:{key,name,detail:p?(cmap.get(p.campaignId)?.name??'')+' · '+p.channel:source??'Пустой source_code или оплата вне бота',placementIds:[],campaignIds:[],channels:[],courses:[],webClicks:0,uniqueBrowsers:0,botStartsRaw:0,botStartsUsers:0,intentsRaw:0,intentUsers:0,paidUsers:0,paymentsCount:0,netRevenue:0,startToIntentPct:null,intentToPaidPct:null,mappingStatus:type,userKeys:[],botEvents:[]},browsers:new Set(),starts:new Set(),intents:new Set(),paid:new Set()};acc.set(key,a);}
  if(p){for(const [field,values] of [['placementIds',[p.id]],['campaignIds',[p.campaignId]],['channels',[p.channel]],['courses',p.courses]] as const)for(const v of values)if(!a.group[field].includes(v))a.group[field].push(v);}
  return a;
 }
 if(mode!=='historical'){
  for(const p of places){if(by!=='course'||p.courses.length===1)get(p.id);else for(const c of p.courses.filter(c=>has(c,scope.courses)))get(p.id,null,c);}
  for(const e of webs){const a=get(e.placementId);a.group.webClicks++;a.browsers.add(e.userId);}
  for(const e of bots){const a=get(e.placementId,e.sourceCode);a.group.botEvents.push(e);if(e.eventType==='start'){a.group.botStartsRaw++;a.starts.add(e.userKey);}else{a.group.intentsRaw++;a.intents.add(e.userKey);}}
  for(const r of payments){const a=get(r.placementId,r.intent?.sourceCode??null,r.payment.course);a.group.paymentsCount++;a.group.netRevenue+=r.net;if(r.payment.userKey)a.paid.add(r.payment.userKey);}
 }
 const groups=[...acc.values()].map(a=>{
  const g=a.group;g.uniqueBrowsers=a.browsers.size;g.botStartsUsers=a.starts.size;g.intentUsers=a.intents.size;g.paidUsers=a.paid.size;g.userKeys=[...new Set([...a.starts,...a.intents,...a.paid])];g.startToIntentPct=ratio(a.intents.size,a.starts.size);
  // Paid numerator is the observed intent cohort, not unrelated purchasers.
  const paidIntents=[...a.paid].filter(k=>a.intents.has(k)).length;g.intentToPaidPct=g.paymentsCount?ratio(paidIntents,a.intents.size):null;
  if(g.mappingStatus==='tracked'&&!g.paymentsCount)g.mappingStatus='no_payments';return g;
 }).sort((a,b)=>b.webClicks-a.webClicks||b.netRevenue-a.netRevenue||a.name.localeCompare(b.name));
 const starters=new Set(bots.filter(e=>e.eventType==='start').map(e=>e.userKey)),intentUsers=new Set(bots.filter(e=>e.eventType==='payment_click').map(e=>e.userKey));
 const paid=new Set(payments.map(r=>r.payment.userKey).filter((k):k is string=>!!k));
 const totals={webClicks:webs.length,uniqueBrowsers:new Set(webs.map(e=>e.userId)).size,botStartsRaw:bots.filter(e=>e.eventType==='start').length,botStartsUnique:starters.size,intentsRaw:bots.filter(e=>e.eventType==='payment_click').length,intentsUnique:intentUsers.size,paymentsCount:payments.length,paidUsersUnique:paid.size,netRevenue:payments.reduce((s,r)=>s+r.net,0),startToIntentPct:ratio(intentUsers.size,starters.size),intentToPaidPct:payments.length?ratio([...paid].filter(k=>intentUsers.has(k)).length,intentUsers.size):null,webToStartPct:ratio(starters.size,webs.length)};
 const unmapped=new Map<string,number>();for(const e of bots.filter(e=>e.mappingStatus==='unmapped'))unmapped.set(e.sourceCode??'',(unmapped.get(e.sourceCode??'')??0)+1);
 return {historical:mode==='historical',totals,groups,payments,intents,botEvents:bots,diagnostics:{unmappedSources:[...unmapped].map(([sourceCode,events])=>({sourceCode,events})),organicEvents:bots.filter(e=>e.mappingStatus==='organic').length,duplicateRows:Math.max(0,(input.botEvents??[]).length-new Set((input.botEvents??[]).map(e=>e.id)).size),intentWithoutStart:[...intentUsers].filter(k=>!starters.has(k)).length},places};
}
