import {attribute,millis,historicalCandidates}from './attribution';
import {normalizeWorkspace,paymentRefund}from './funnel-data';
export {millis}from './attribution';
export {funnelReport}from './funnel-report';
import type{Workspace,Mode,ReportScope,Options,Placement,Campaign,CourseEconomics,Payment,Selection}from './types';
export const NONE='Курс не указан';
export const has=(value:string,selection:Selection)=>selection===null||selection.includes(value);
const DAY=86400000;
export function defaults(mode:Mode|'all'):ReportScope{
 const historical=mode==='historical'||mode==='all',live=mode==='live';const today=new Date().toISOString().slice(0,10);
 return {mode,channels:null,courses:null,campaigns:null,from:historical?'2026-08-04':'2026-09-12',to:mode==='all'?'2026-09-23':historical?'2026-09-10':live?today:'2026-09-23',asOf:historical?'2026-09-10':live?today:'2026-09-30'};
}
// Mixed calendar data must not silently hide a real launch behind the synthetic demo.
export function reportingMode(data:Workspace,s:ReportScope):Mode{
 if(s.mode!=='all')return s.mode;
 const matched=data.placements.filter(p=>has(p.channel,s.channels)&&has(p.campaignId,s.campaigns)&&has(p.id,s.placements??null)&&millis(p.startsAt)>=millis(s.from+'T00:00:00Z')&&millis(p.startsAt)<=millis(s.to+'T23:59:59Z')&&(s.courses===null||p.courses.some(c=>has(c,s.courses))||!p.courses.length&&has(NONE,s.courses)));
 return matched.some(p=>p.mode==='live')?'live':matched.length&&matched.every(p=>p.mode==='historical')?'historical':'demo';
}
export function reportingScope(data:Workspace,s:ReportScope):ReportScope{
 const mode=reportingMode(data,s);
 return s.mode==='all'?{...s,mode,asOf:defaults(mode).asOf}:s;
}
export function campaigns(data:Workspace,mode?:Mode){
 const out=new Map<string,Campaign>();
 for(const p of data.placements.filter(p=>!mode||p.mode===mode))if(!out.has(p.campaignId))out.set(p.campaignId,{id:p.campaignId,mode:p.mode,name:p.title,goal:'Продажа курса',owner:p.owner,extraCost:null,estimatedAdCost:null});
 for(const c of data.campaigns??[])if(!mode||c.mode===mode)out.set(c.id,c);
 return [...out.values()];
}
export function economy(data:Workspace,mode:Mode,course:string):CourseEconomics{return data.economics?.find(e=>e.mode===mode&&e.course===course)??{id:'eco_'+mode+'_'+course,mode,course,deliveryPercent:null,feePercent:null,perSaleCost:null};}
export function netPayment(p:Payment){return p.amount-paymentRefund(p);}
export function contribution(data:Workspace,mode:Mode,p:Payment):number|null{
 const e=economy(data,mode,p.course);if(e.deliveryPercent===null||e.feePercent===null||e.perSaleCost===null)return null;
 return Math.round((netPayment(p)*(1-e.deliveryPercent/100-e.feePercent/100)-e.perSaleCost)*100)/100;
}
export function selectedPlacement(p:Placement,s:ReportScope,includePlanned=false){return(s.mode==='all'||p.mode===s.mode)&&has(p.id,s.placements??null)&&(includePlanned?p.status!=='cancelled':(p.mode==='historical'?p.status==='published':p.status!=='cancelled')&&millis(p.startsAt)<=millis(s.asOf+'T23:59:59Z'))&&has(p.channel,s.channels)&&has(p.campaignId,s.campaigns)&&millis(p.startsAt)>=millis(s.from+'T00:00:00Z')&&millis(p.startsAt)<=millis(s.to+'T23:59:59Z');}
export function courseShare(p:Placement,course:string){
 if(!p.courses.length)return course===NONE?1:0;
 const configured=p.courseShares;
 return configured?configured[course]??0:p.courses.includes(course)?1/p.courses.length:0;
}
export function visibleIntents(input:Workspace,s:ReportScope){
 const data=normalizeWorkspace(input);return data.purchaseIntents!.filter(i=>(s.mode==='all'||i.mode===s.mode)&&i.occurredAt<=s.asOf+'T23:59:59.999Z'&&(()=>{const p=data.placements.find(p=>p.id===i.placementId);return p?selectedPlacement(p,s)&&(s.courses===null||p.courses.some(c=>has(c,s.courses))):s.channels===null&&s.campaigns===null&&(s.placements??null)===null&&has(NONE,s.courses)&&i.occurredAt>=s.from+'T00:00:00Z'&&i.occurredAt<=s.to+'T23:59:59.999Z';})());
}
export function report(input:Workspace,s:ReportScope,opt:Options,maturityDays=7){
 const data=normalizeWorkspace(input);
 const mode=s.mode==='all'?'demo':s.mode;
 // Compute the complete path FIRST. Scope filters never inflate the credit left on screen.
 const all=attribute(data,mode,{...opt,asOf:s.asOf+'T23:59:59Z'}),places=data.placements.filter(p=>selectedPlacement(p,{...s,mode}));
 const ids=new Set(places.map(p=>p.id)),payBy=new Map(data.payments.map(p=>[p.id,p]));
 const intentBy=new Map(data.purchaseIntents!.map(i=>[i.id,i]));
 const rows=all.filter(a=>has(a.course,s.courses)&&(a.placementId?ids.has(a.placementId):(s.channels===null&&s.campaigns===null&&(s.placements??null)===null&&(()=>{const pay=payBy.get(a.paymentId),i=pay?.purchaseIntentId?intentBy.get(pay.purchaseIntentId):null;return i?.placementId?ids.has(i.placementId):millis(a.paymentAt,mode==='historical'?opt.paymentOffset:0)>=millis(s.from+'T00:00:00Z')&&millis(a.paymentAt,mode==='historical'?opt.paymentOffset:0)<=millis(s.to+'T23:59:59Z');})())));

 const cmap=new Map(campaigns(data,mode).map(c=>[c.id,c]));
 type Cell={key:string;placementId:string;basis:Set<string>;lowConfidence:boolean;campaignId:string;campaignName:string;course:string;channel:string;adCost:number;extraCost:number;costKnown:boolean;adKnown:boolean;economicsKnown:boolean;scenario:boolean;shareAssumed:boolean;mature:boolean;netRevenue:number;grossRevenue:number;refunds:number;contribution:number;paymentCredits:number;buyers:Set<string>;leadIds:Set<string>;cohortBuyerIds:Set<string>;messages:Set<string>;clicks:number;starts:Set<string>;placementIds:Set<string>};
 const cells=new Map<string,Cell>();
 function cell(cid:string,course:string,channel:string,pid='unknown'){const key=pid+'|'+course;let c=cells.get(key);if(!c){c={key,placementId:pid,basis:new Set(),lowConfidence:false,campaignId:cid,campaignName:cmap.get(cid)?.name??'Источник неизвестен',course,channel,adCost:0,extraCost:0,costKnown:cid!=='unknown',adKnown:cid!=='unknown',economicsKnown:true,scenario:false,shareAssumed:false,mature:true,netRevenue:0,grossRevenue:0,refunds:0,contribution:0,paymentCredits:0,buyers:new Set(),leadIds:new Set(),cohortBuyerIds:new Set(),messages:new Set(),clicks:0,starts:new Set(),placementIds:new Set()};cells.set(key,c);}return c;}
 for(const p of places){
  const camp=cmap.get(p.campaignId)!,full=data.placements.filter(q=>q.mode===mode&&q.campaignId===p.campaignId&&q.status!=='cancelled');
  const totalKnown=full.every(q=>q.cost!==null),total=full.reduce((n,q)=>n+(q.cost??0),0);
  const estimated=mode==='historical'&&camp.estimatedAdCost!==null;
  const pcost=estimated?camp.estimatedAdCost!/full.length:p.cost;
  // Split shared creative/tool costs in proportion to ad spend; equal if unavailable/zero.
  const extraShare=totalKnown&&total>0?(p.cost??0)/total:1/full.length;
  for(const course of p.courses.length?p.courses:[NONE]){
   if(!has(course,s.courses))continue;const c=cell(p.campaignId,course,p.channel,p.id),share=courseShare(p,course);
   c.placementIds.add(p.id);c.adCost+=(pcost??0)*share;c.extraCost+=(camp.extraCost??0)*extraShare*share;
   c.adKnown&&=pcost!==null;c.costKnown&&=pcost!==null&&camp.extraCost!==null;c.scenario||=estimated;c.shareAssumed||=p.courses.length>1&&!p.courseShares;
   c.mature&&=millis(p.endsAt)+maturityDays*DAY<=millis(s.asOf+'T23:59:59Z');
  }
 }
 for(const a of rows){
  const p=places.find(p=>p.id===a.placementId),c=cell(a.campaignId,a.course,p?.channel??'Источник неизвестен',a.placementId??'unknown'),pay=payBy.get(a.paymentId)!;
  if(p){c.placementIds.add(p.id);c.mature&&=millis(p.endsAt)+maturityDays*DAY<=millis(s.asOf+'T23:59:59Z');if(!p.courses.includes(a.course))c.costKnown=false;}
  c.netRevenue+=a.revenue;c.grossRevenue+=a.grossRevenue??a.amount*a.weight;c.refunds+=a.refunds??0;c.paymentCredits+=a.weight;c.basis.add(a.basis);c.lowConfidence||=p?.match==='family_candidate';
  c.buyers.add(a.userKey??a.userId);const profit=contribution(data,mode,pay);if(profit===null)c.economicsKnown=false;else c.contribution+=profit*a.weight;
 }
 const leads=visibleIntents(data,{...s,mode});
 for(const i of leads){const p=places.find(p=>p.id===i.placementId),course=i.course??NONE;if(!has(course,s.courses))continue;const c=cell(p?.campaignId??'unknown',course,p?.channel??'Источник неизвестен',p?.id??'unknown');c.leadIds.add(i.userKey);c.messages.add(i.userKey);
  if(data.payments.some(pay=>pay.mode===mode&&pay.userKey===i.userKey&&(!pay.purchaseIntentId||pay.purchaseIntentId===i.id)&&(!i.course||pay.course===i.course)&&millis(pay.at)>=millis(i.occurredAt)&&millis(pay.at)<=millis(s.asOf+'T23:59:59Z')))c.cohortBuyerIds.add(i.userKey);
 }
 for(const e of data.events.filter(e=>e.mode===mode&&millis(e.at)<=millis(s.asOf+'T23:59:59Z')&&['click','visit','web_visit'].includes(e.type))){const p=places.find(p=>p.id===e.placementId);if(!p)continue;const course=p.courses.length===1?p.courses[0]:NONE;if(!has(course,s.courses))continue;cell(p.campaignId,course,p.channel,p.id).clicks++;}
 for(const e of data.botEvents!.filter(e=>e.mode===mode&&e.eventType==='start'&&millis(e.occurredAt)<=millis(s.asOf+'T23:59:59Z'))){const p=places.find(p=>p.id===e.placementId);if(!p)continue;const course=p.courses.length===1?p.courses[0]:NONE;if(has(course,s.courses))cell(p.campaignId,course,p.channel,p.id).starts.add(e.userKey);}

 return {mode,rows,all,places,cells:[...cells.values()],leads,payBy,cmap};
}
export type Report=ReturnType<typeof report>;
export type GroupBy='campaignCourse'|'course'|'campaign'|'channel'|'placement';
export function groupReport(r:Report,by:GroupBy){
 const map=new Map<string,{key:string;name:string;detail:string;basis:Set<string>;lowConfidence:boolean;campaignIds:Set<string>;courses:Set<string>;channels:Set<string>;adCost:number;extraCost:number;costKnown:boolean;adKnown:boolean;economicsKnown:boolean;scenario:boolean;shareAssumed:boolean;mature:boolean;netRevenue:number;grossRevenue:number;refunds:number;contribution:number;paymentCredits:number;buyers:Set<string>;leadIds:Set<string>;cohortBuyerIds:Set<string>;messages:Set<string>;clicks:number;starts:Set<string>;placementIds:Set<string>}>();
 for(const c of r.cells){const key=by==='placement'?c.placementId:by==='course'?c.course:by==='campaign'?c.campaignId:by==='channel'?c.channel:c.campaignId+'|'+c.course;
  let g=map.get(key);if(!g){g={...c,key,name:by==='placement'?r.places.find(p=>p.id===c.placementId)?.title??'Источник неизвестен':by==='course'?c.course:by==='channel'?c.channel:c.campaignName,detail:by==='campaignCourse'?c.course:'',basis:new Set(),lowConfidence:false,campaignIds:new Set(),courses:new Set(),channels:new Set(),buyers:new Set(),leadIds:new Set(),cohortBuyerIds:new Set(),messages:new Set(),starts:new Set(),placementIds:new Set(),adCost:0,extraCost:0,netRevenue:0,grossRevenue:0,refunds:0,contribution:0,paymentCredits:0,costKnown:true,adKnown:true,economicsKnown:true,scenario:false,shareAssumed:false,mature:true,clicks:0};map.set(key,g);}
  for(const field of ['adCost','extraCost','netRevenue','grossRevenue','refunds','contribution','paymentCredits','clicks']as const)g[field]+=c[field];
  for(const field of ['basis','buyers','leadIds','cohortBuyerIds','messages','starts','placementIds']as const)for(const v of c[field])g[field].add(v);
  g.lowConfidence||=c.lowConfidence;g.campaignIds.add(c.campaignId);g.courses.add(c.course);g.channels.add(c.channel);g.adKnown&&=c.adKnown;g.costKnown&&=c.costKnown;g.economicsKnown&&=c.economicsKnown;g.mature&&=c.mature;g.scenario||=c.scenario;g.shareAssumed||=c.shareAssumed;
 }
 return [...map.values()].map(g=>{
  const marketingCost=g.adCost+g.extraCost;
  const roas=g.adKnown&&g.adCost>0&&g.mature?g.netRevenue/g.adCost:null;
  const romi=g.costKnown&&g.economicsKnown&&marketingCost>0&&g.mature?(g.contribution-marketingCost)/marketingCost*100:null;
  const reason=!g.costKnown?'Расходы не заполнены':!g.mature?'Ожидаем оплаты':!g.economicsKnown?'Не заполнена экономика курса':marketingCost<=0?'Нет затрат для деления':'';
  return {...g,marketingCost,roas,romi,reason,netProfit:g.costKnown&&g.economicsKnown?g.contribution-marketingCost:null,leads:g.leadIds.size,cohortBuyers:g.cohortBuyerIds.size,uniqueBuyers:g.buyers.size,conversion:g.leadIds.size?g.cohortBuyerIds.size/g.leadIds.size*100:null,cpl:g.costKnown&&g.leadIds.size?marketingCost/g.leadIds.size:null,cpa:g.costKnown&&g.paymentCredits>0?marketingCost/g.paymentCredits:null,breakEvenRevenue:g.costKnown&&g.economicsKnown&&g.netRevenue>0&&g.contribution>0?marketingCost/(g.contribution/g.netRevenue):null};
 }).sort((a,b)=>b.netRevenue-a.netRevenue||b.marketingCost-a.marketingCost);
}

export function historicalCoverage(data:Workspace,opt:Options){
 const payments=data.payments.filter(p=>p.mode==='historical'&&(!opt.asOf||millis(p.at,opt.paymentOffset)<=millis(opt.asOf)));
 let matched=0,explicit=0,family=0;const lags:number[]=[];
 for(const p of payments){const when=millis(p.at,opt.paymentOffset),cs=historicalCandidates(data,p.course,when,opt);if(cs.length)matched++;if(cs.some(p=>p.match==='explicit'))explicit++;if(cs.some(p=>p.match==='family_candidate'))family++;for(const c of cs)lags.push((when-millis(c.startsAt))/DAY);}
 lags.sort((a,b)=>a-b);const n=lags.length;return {total:payments.length,matched,unknown:payments.length-matched,explicit,family,compatiblePairs:n,medianLagDays:n?(lags[Math.floor((n-1)/2)]+lags[Math.floor(n/2)])/2:null};
}
