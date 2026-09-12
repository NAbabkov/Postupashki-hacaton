import {attribute,millis}from './attribution';
import type{Workspace,Mode,ReportScope,Options,Placement,Campaign,CourseEconomics,Allocation,Lead,Payment,Selection}from './types';
export const NONE='Курс не указан';
export const has=(value:string,selection:Selection)=>selection===null||selection.includes(value);
const DAY=86400000;
export function defaults(mode:Mode|'all'):ReportScope{
 const historical=mode==='historical'||mode==='all',live=mode==='live';const today=new Date().toISOString().slice(0,10);
 return {mode,channels:null,courses:null,campaigns:null,from:historical?'2026-08-04':'2026-09-12',to:mode==='all'?'2026-09-23':historical?'2026-09-10':live?today:'2026-09-23',asOf:historical?'2026-09-10':live?today:'2026-09-30'};
}
export function campaigns(data:Workspace,mode?:Mode){
 const out=new Map<string,Campaign>();
 for(const p of data.placements.filter(p=>!mode||p.mode===mode))if(!out.has(p.campaignId))out.set(p.campaignId,{id:p.campaignId,mode:p.mode,name:p.title,goal:'Продажа курса',owner:p.owner,extraCost:null,estimatedAdCost:null});
 for(const c of data.campaigns??[])if(!mode||c.mode===mode)out.set(c.id,c);
 return [...out.values()];
}
export function economy(data:Workspace,mode:Mode,course:string):CourseEconomics{return data.economics?.find(e=>e.mode===mode&&e.course===course)??{id:'eco_'+mode+'_'+course,mode,course,deliveryPercent:null,feePercent:null,perSaleCost:null};}
export function netPayment(p:Payment){return Math.max(0,p.amount-(p.status==='refunded'?p.amount:p.refundAmount??0));}
export function contribution(data:Workspace,mode:Mode,p:Payment):number|null{
 const e=economy(data,mode,p.course);if(e.deliveryPercent===null||e.feePercent===null||e.perSaleCost===null)return null;
 return Math.round((netPayment(p)*(1-e.deliveryPercent/100-e.feePercent/100)-e.perSaleCost)*100)/100;
}
export function selectedPlacement(p:Placement,s:ReportScope,includePlanned=false){return(s.mode==='all'||p.mode===s.mode)&&has(p.id,s.placements??null)&&(includePlanned?p.status!=='cancelled':p.status==='published'&&millis(p.startsAt)<=millis(s.asOf+'T23:59:59Z'))&&has(p.channel,s.channels)&&has(p.campaignId,s.campaigns)&&millis(p.startsAt)>=millis(s.from+'T00:00:00Z')&&millis(p.startsAt)<=millis(s.to+'T23:59:59Z');}
export function courseShare(p:Placement,course:string){
 if(!p.courses.length)return course===NONE?1:0;
 const configured=p.courseShares;
 return configured?configured[course]??0:p.courses.includes(course)?1/p.courses.length:0;
}
export function leadSource(data:Workspace,l:Lead,asOf:string){
 const until=millis(asOf+'T23:59:59Z');
 if(l.sourcePlacementId){const p=data.placements.find(p=>p.id===l.sourcePlacementId&&p.mode===l.mode);if(p&&millis(l.createdAt)<=until)return p;}
 const e=data.events.filter(e=>e.mode===l.mode&&e.userId===l.userId&&['visit','start_bot','manager_source'].includes(e.type)&&e.placementId&&millis(e.at)<=until).sort((a,b)=>millis(a.at)-millis(b.at)).find(e=>{const p=data.placements.find(p=>p.id===e.placementId);return p&&p.status==='published'&&(!l.course||!p.courses.length||p.courses.includes(l.course));});
 return data.placements.find(p=>p.id===e?.placementId);
}
export function visibleLeads(data:Workspace,s:ReportScope){return data.leads.filter(l=>(s.mode==='all'||l.mode===s.mode)&&has(l.course||NONE,s.courses)&&millis(l.createdAt)<=millis(s.asOf+'T23:59:59Z')&&(()=>{const p=leadSource(data,l,s.asOf);return p?selectedPlacement(p,s):(s.channels===null&&s.campaigns===null&&millis(l.createdAt)>=millis(s.from+'T00:00:00Z')&&millis(l.createdAt)<=millis(s.to+'T23:59:59Z'));})());}
export function report(data:Workspace,s:ReportScope,opt:Options,maturityDays=7){
 const mode=s.mode==='all'?'demo':s.mode;
 // Compute the complete path FIRST. Scope filters never inflate the credit left on screen.
 const all=attribute(data,mode,{...opt,asOf:s.asOf+'T23:59:59Z'}),places=data.placements.filter(p=>selectedPlacement(p,{...s,mode}));
 const ids=new Set(places.map(p=>p.id)),payBy=new Map(data.payments.map(p=>[p.id,p]));
 const rows=all.filter(a=>has(a.course,s.courses)&&(a.placementId?ids.has(a.placementId):(s.channels===null&&s.campaigns===null&&(data.leads.some(l=>l.mode===mode&&l.userId===a.userId&&l.course===a.course&&(()=>{const p=leadSource(data,l,s.asOf);return p&&ids.has(p.id);})())||millis(a.paymentAt,mode==='historical'?opt.paymentOffset:0)>=millis(s.from+'T00:00:00Z')&&millis(a.paymentAt,mode==='historical'?opt.paymentOffset:0)<=millis(s.to+'T23:59:59Z')))));
 const cmap=new Map(campaigns(data,mode).map(c=>[c.id,c]));
 type Cell={key:string;campaignId:string;campaignName:string;course:string;channel:string;adCost:number;extraCost:number;costKnown:boolean;adKnown:boolean;economicsKnown:boolean;scenario:boolean;shareAssumed:boolean;mature:boolean;netRevenue:number;grossRevenue:number;refunds:number;contribution:number;paymentCredits:number;buyers:Set<string>;leadIds:Set<string>;cohortBuyerIds:Set<string>;messages:Set<string>;clicks:number;starts:Set<string>;placementIds:Set<string>};
 const cells=new Map<string,Cell>();
 function cell(cid:string,course:string,channel:string){const key=cid+'|'+course+'|'+channel;let c=cells.get(key);if(!c){c={key,campaignId:cid,campaignName:cmap.get(cid)?.name??'Источник неизвестен',course,channel,adCost:0,extraCost:0,costKnown:cid!=='unknown',adKnown:cid!=='unknown',economicsKnown:true,scenario:false,shareAssumed:false,mature:true,netRevenue:0,grossRevenue:0,refunds:0,contribution:0,paymentCredits:0,buyers:new Set(),leadIds:new Set(),cohortBuyerIds:new Set(),messages:new Set(),clicks:0,starts:new Set(),placementIds:new Set()};cells.set(key,c);}return c;}
 for(const p of places){
  const camp=cmap.get(p.campaignId)!,full=data.placements.filter(q=>q.mode===mode&&q.campaignId===p.campaignId&&q.status==='published');
  const totalKnown=full.every(q=>q.cost!==null),total=full.reduce((n,q)=>n+(q.cost??0),0);
  const estimated=mode==='historical'&&camp.estimatedAdCost!==null;
  const pcost=estimated?camp.estimatedAdCost!/full.length:p.cost;
  // Split shared creative/tool costs in proportion to ad spend; equal if unavailable/zero.
  const extraShare=totalKnown&&total>0?(p.cost??0)/total:1/full.length;
  for(const course of p.courses.length?p.courses:[NONE]){
   if(!has(course,s.courses))continue;const c=cell(p.campaignId,course,p.channel),share=courseShare(p,course);
   c.placementIds.add(p.id);c.adCost+=(pcost??0)*share;c.extraCost+=(camp.extraCost??0)*extraShare*share;
   c.adKnown&&=pcost!==null;c.costKnown&&=pcost!==null&&camp.extraCost!==null;c.scenario||=estimated;c.shareAssumed||=p.courses.length>1&&!p.courseShares;
   c.mature&&=millis(p.endsAt)+maturityDays*DAY<=millis(s.asOf+'T23:59:59Z');
  }
 }
 for(const a of rows){
  const p=places.find(p=>p.id===a.placementId),c=cell(a.campaignId,a.course,p?.channel??'Источник неизвестен'),pay=payBy.get(a.paymentId)!;
  if(p){c.placementIds.add(p.id);c.mature&&=millis(p.endsAt)+maturityDays*DAY<=millis(s.asOf+'T23:59:59Z');if(!p.courses.includes(a.course))c.costKnown=false;}
  c.netRevenue+=a.revenue;c.grossRevenue+=a.grossRevenue??a.amount*a.weight;c.refunds+=a.refunds??0;c.paymentCredits+=a.revenue>0?a.weight:0;
  if(a.revenue>0)c.buyers.add(a.userId);const profit=contribution(data,mode,pay);if(profit===null)c.economicsKnown=false;else c.contribution+=profit*a.weight;
 }
 const leads=visibleLeads(data,{...s,mode});
 for(const l of leads){const p=leadSource(data,l,s.asOf),c=cell(p?.campaignId??'unknown',l.course||NONE,p?.channel??'Источник неизвестен');c.leadIds.add(l.id);
  if(data.payments.some(pay=>pay.mode===mode&&pay.userId===l.userId&&pay.course===l.course&&netPayment(pay)>0&&millis(pay.at)<=millis(s.asOf+'T23:59:59Z')))c.cohortBuyerIds.add(l.userId+'|'+l.course);
 }
 for(const e of data.events.filter(e=>e.mode===mode&&millis(e.at)<=millis(s.asOf+'T23:59:59Z'))){
  const p=places.find(p=>p.id===e.placementId);if(!p)continue;
  // A multi-course click has no chosen product. Never guess it from the visitor's first lead.
  const l=data.leads.find(l=>l.mode===mode&&e.id==='lead_event_'+l.id);
  const course=e.course??l?.course??(p.courses.length===1?p.courses[0]:NONE);if(!has(course,s.courses))continue;
  const c=cell(p.campaignId,course,p.channel);if(e.type==='click'||e.type==='visit')c.clicks++;if(e.type==='visit'||e.type==='start_bot')c.starts.add(e.userId);if(e.type==='lead'||e.type==='message')c.messages.add(e.userId);
 }
 return {mode,rows,all,places,cells:[...cells.values()],leads,payBy,cmap};
}
export type Report=ReturnType<typeof report>;
export type GroupBy='campaignCourse'|'course'|'campaign'|'channel';
export function groupReport(r:Report,by:GroupBy){
 const map=new Map<string,{key:string;name:string;detail:string;campaignIds:Set<string>;courses:Set<string>;channels:Set<string>;adCost:number;extraCost:number;costKnown:boolean;adKnown:boolean;economicsKnown:boolean;scenario:boolean;shareAssumed:boolean;mature:boolean;netRevenue:number;grossRevenue:number;refunds:number;contribution:number;paymentCredits:number;buyers:Set<string>;leadIds:Set<string>;cohortBuyerIds:Set<string>;messages:Set<string>;clicks:number;starts:Set<string>;placementIds:Set<string>}>();
 for(const c of r.cells){const key=by==='course'?c.course:by==='campaign'?c.campaignId:by==='channel'?c.channel:c.campaignId+'|'+c.course;
  let g=map.get(key);if(!g){g={...c,key,name:by==='course'?c.course:by==='channel'?c.channel:c.campaignName,detail:by==='campaignCourse'?c.course:'',campaignIds:new Set(),courses:new Set(),channels:new Set(),buyers:new Set(),leadIds:new Set(),cohortBuyerIds:new Set(),messages:new Set(),starts:new Set(),placementIds:new Set(),adCost:0,extraCost:0,netRevenue:0,grossRevenue:0,refunds:0,contribution:0,paymentCredits:0,costKnown:true,adKnown:true,economicsKnown:true,scenario:false,shareAssumed:false,mature:true,clicks:0};map.set(key,g);}
  for(const field of ['adCost','extraCost','netRevenue','grossRevenue','refunds','contribution','paymentCredits','clicks']as const)g[field]+=c[field];
  for(const field of ['buyers','leadIds','cohortBuyerIds','messages','starts','placementIds']as const)for(const v of c[field])g[field].add(v);
  g.campaignIds.add(c.campaignId);g.courses.add(c.course);g.channels.add(c.channel);g.adKnown&&=c.adKnown;g.costKnown&&=c.costKnown;g.economicsKnown&&=c.economicsKnown;g.mature&&=c.mature;g.scenario||=c.scenario;g.shareAssumed||=c.shareAssumed;
 }
 return [...map.values()].map(g=>{
  const marketingCost=g.adCost+g.extraCost;
  const roas=g.adKnown&&g.adCost>0&&g.mature?g.netRevenue/g.adCost:null;
  const romi=g.costKnown&&g.economicsKnown&&marketingCost>0&&g.mature?(g.contribution-marketingCost)/marketingCost*100:null;
  const reason=!g.costKnown?'Расходы не заполнены':!g.mature?'Ожидаем оплаты':!g.economicsKnown?'Не заполнена экономика курса':marketingCost<=0?'Нет затрат для деления':'';
  return {...g,marketingCost,roas,romi,reason,netProfit:g.costKnown&&g.economicsKnown?g.contribution-marketingCost:null,leads:g.leadIds.size,cohortBuyers:g.cohortBuyerIds.size,uniqueBuyers:g.buyers.size,conversion:g.leadIds.size?g.cohortBuyerIds.size/g.leadIds.size*100:null,cpl:g.costKnown&&g.leadIds.size?marketingCost/g.leadIds.size:null,cpa:g.costKnown&&g.paymentCredits>0?marketingCost/g.paymentCredits:null,breakEvenRevenue:g.costKnown&&g.economicsKnown&&g.netRevenue>0&&g.contribution>0?marketingCost/(g.contribution/g.netRevenue):null};
 }).sort((a,b)=>b.netRevenue-a.netRevenue||b.marketingCost-a.marketingCost);
}
