import type {Workspace,BotFunnel} from './types';
import {normalizeWorkspace} from './funnel-data';
export function botFunnel(data:Workspace,placementIds:(string|null)[],asOf='9999-12-31T23:59:59Z'):BotFunnel{
 const normalized=normalizeWorkspace(data),ids=new Set(placementIds),events=data.events.filter(e=>ids.has(e.placementId)&&e.at<=asOf),bots=normalized.botEvents!.filter(e=>ids.has(e.placementId)&&e.occurredAt<=asOf),starts=bots.filter(e=>e.eventType==='start'),intents=bots.filter(e=>e.eventType==='payment_click');
 const starterKeys=new Set(starts.map(e=>e.userKey)),intentKeys=new Set(intents.map(e=>e.userKey));
 return {webClicks:events.filter(e=>e.type==='web_visit'||e.type==='visit').length,startEvents:starts.length,intentEvents:intents.length,uniqueStarters:starterKeys.size,uniqueIntentUsers:intentKeys.size,conversion:starterKeys.size?intentKeys.size/starterKeys.size*100:null,eventConversion:starts.length?intents.length/starts.length*100:null,intentWithoutStart:[...intentKeys].filter(key=>!starterKeys.has(key)).length};
}
