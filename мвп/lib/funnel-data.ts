import type {BotEvent,Payment,PurchaseIntent,Workspace} from './types';

export const syntheticUserKey=(id:string)=>'synthetic_'+id;
// A canonical tuple gives a stable, collision-free view ID, even when an older CSV is imported later.
export const intentId=(e:Pick<BotEvent,'mode'|'userKey'|'placementId'|'sourceCode'>)=>'intent_'+encodeURIComponent(JSON.stringify([e.mode,e.userKey,e.placementId,e.sourceCode]));
export const maskUser=(key:string|null|undefined)=>key?key.slice(0,5)+'…'+key.slice(-5):'Источник неизвестен';
export function paymentRefund(p:Payment){return p.status==='refunded'?p.amount:Math.min(p.amount,Math.max(0,p.refundAmount??0));}

/** Normalize legacy storage without rewriting history or fabricating live bot activity. */
export function normalizeWorkspace(data:Workspace):Workspace{
 const places=new Map(data.placements.map(p=>[p.id,p])),bot=new Map<string,BotEvent>();
 for(const e of data.botEvents??[])bot.set(e.id,{...e});
 for(const e of data.events){
  if(e.mode==='historical')continue;
  const legacyDemo=e.mode==='demo'&&!e.botImportId;
  const type=e.type==='bot_start'||e.type==='start_bot'?'start':e.type==='bot_payment_click'?'payment_click':legacyDemo&&['lead','message'].includes(e.type)?'payment_click':legacyDemo&&e.type==='visit'?'start':null;
  if(!type)continue;
  const p=e.placementId?places.get(e.placementId):undefined;
  const userKey=e.botUserKey??(e.mode==='demo'?syntheticUserKey(e.userId):/^bot_[a-f0-9]{64}$/.test(e.userId)?e.userId.slice(4):null);
  if(!userKey)continue; // An old browser/manual identity cannot become a Telegram identity.
  const source=e.sourceCode??(legacyDemo&&p?'synthetic|'+p.channel+'|'+p.id:null);
  const id=legacyDemo&&e.type==='visit'?'synthetic_start_'+e.id:e.id;
  if(!bot.has(id))bot.set(id,{id,mode:e.mode,occurredAt:legacyDemo&&e.type==='visit'?new Date(Date.parse(e.at)+30000).toISOString():e.at,userKey,eventType:type,sourceCode:source,socialNetwork:e.socialNetwork??(source?.split('|')[0]??null),channel:e.channel??(source?.split('|')[1]??null),contentId:e.botTrackingKey??(source?.split('|')[2]??null),placementId:p?.mode===e.mode?p.id:null,importBatchId:e.botImportId??'legacy_synthetic_adapter',mappingStatus:p?.mode===e.mode?'mapped':source?'unmapped':'organic'});
 }
 const botEvents=[...bot.values()].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id));
 const intents=new Map<string,PurchaseIntent>();
 for(const e of botEvents.filter(e=>e.eventType==='payment_click')){
  const id=intentId(e);if(intents.has(id))continue;
  const p=e.placementId?places.get(e.placementId):undefined;
  intents.set(id,{id,mode:e.mode,userKey:e.userKey,placementId:e.placementId,sourceCode:e.sourceCode,occurredAt:e.occurredAt,course:p?.courses.length===1?p.courses[0]:null,status:'open'});
 }
 const payments=data.payments.map(p=>{
  const userKey=p.mode==='historical'?null:p.userKey!==undefined?p.userKey:p.mode==='demo'?syntheticUserKey(p.userId):/^bot_[a-f0-9]{64}$/.test(p.userId)?p.userId.slice(4):null;
  let purchaseIntentId=p.purchaseIntentId??null;
  // Only the explicitly synthetic legacy demo is allowed to migrate CRM links.
  if(p.mode==='demo'&&!purchaseIntentId&&p.leadId){const l=data.leads.find(l=>l.id===p.leadId);const i=[...intents.values()].find(i=>i.mode===p.mode&&i.userKey===userKey&&i.placementId===(l?.sourcePlacementId??null)&&(!i.course||i.course===p.course)&&i.occurredAt<=p.at);purchaseIntentId=i?.id??null;}
  return {...p,userKey,purchaseIntentId,...(p.mode==='historical'?{historicalBuyerId:p.historicalBuyerId??p.userId}:{})};
 });
 for(const i of intents.values())i.status=payments.some(p=>p.mode===i.mode&&p.userKey===i.userKey&&p.at>=i.occurredAt&&(p.purchaseIntentId?p.purchaseIntentId===i.id:!i.course||p.course===i.course))?'paid':'open';
 return {...data,botEvents,purchaseIntents:[...intents.values()],payments};
}
