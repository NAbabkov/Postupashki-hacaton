import {decodeSource,sha256} from './bot-referral';
import {normalizeBotCsv,BOT_HEADERS} from './bot-import';
import type {Placement,Touch,BotEvent} from './types';
export interface BotConfig {enabled:boolean;welcome:string;managerUrl:string;updatedAt?:string;}
export const DEFAULT_BOT_CONFIG:BotConfig={enabled:false,welcome:'Здравствуйте! Вы перешли из публикации Поступашек. Нажмите «Перейти к покупке», чтобы обсудить курс с менеджером.',managerUrl:'https://t.me/menshe_treh'};
export function exportTelegramCsv(events:BotEvent[]){const rows=[BOT_HEADERS,...events.filter(e=>e.mode==='live').map(e=>[e.occurredAt,'',e.userKey,e.eventType,e.sourceCode??'',e.socialNetwork??'',e.channel??'',e.contentId??''])];return '\uFEFF'+rows.map(row=>row.map(v=>'"'+(/^[=+\-@\t\r]/.test(v)?"'":'')+v.replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';}
export interface BotMenu {userKey:string;sourceCode:string|null;preview:boolean;}
interface User {id:number;is_bot?:boolean;}
export interface TelegramUpdate {update_id:number;message?:{text?:string;date:number;chat:{id:number;type:string};from?:User};callback_query?:{id:string;data?:string;from:User;message?:{chat:{id:number;type:string}}};}
export interface BotPlan {touch?:Touch;menu?:BotMenu&{key:string};chatId?:number;text?:string;keyboard?:{inline_keyboard:({text:string;callback_data:string}|{text:string;url:string})[][]};callbackId?:string;preview?:boolean;}
export function validateBotConfig(value:unknown):Pick<BotConfig,'welcome'|'managerUrl'>{
 if(!value||typeof value!=='object')throw new Error('Неверные настройки.');
 const v=value as Record<string,unknown>;
 if(typeof v.welcome!=='string'||!v.welcome.trim()||v.welcome.length>800)throw new Error('Сообщение: от 1 до 800 символов.');
 if(typeof v.managerUrl!=='string'||!/^https:\/\/t\.me\/[a-z][a-z0-9_]{4,31}$/i.test(v.managerUrl))throw new Error('Нужен адрес менеджера https://t.me/username.');
 return {welcome:v.welcome.trim(),managerUrl:v.managerUrl};
}
export async function telegramUserKey(salt:string,id:number){
 if(!Number.isSafeInteger(id)||id<=0||salt.length<32)throw new Error('Неверный Telegram ID или salt.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(salt),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(String(id))))).map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function webhookSecretMatches(expected:string,provided:string){
 if(expected.length<32||provided.length>256)return false;
 const e=new TextEncoder(),key=await crypto.subtle.importKey('raw',e.encode(expected),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 return crypto.subtle.verify('HMAC',key,await crypto.subtle.sign('HMAC',key,e.encode(expected)),e.encode(provided));
}
export async function planTelegramUpdate(update:TelegramUpdate,options:{salt:string;placements:Placement[];config:BotConfig;receivedAt:string;lookupMenu:(key:string)=>Promise<BotMenu|null>;legacySource?:(fingerprint:string,userKey:string)=>Promise<string|null>}):Promise<BotPlan>{
 const {salt,placements,config}=options,m=update.message,c=update.callback_query;
 if(m&&m.chat?.type==='private'&&m.from&&!m.from.is_bot&&/^\/start(?:@[a-z0-9_]+)?(?:\s|$)/i.test(m.text??'')){
  const userKey=await telegramUserKey(salt,m.from.id),param=(m.text??'').trim().split(/\s+/)[1];let sourceCode:string|null=null;
  if(param)try{const source=decodeSource(param),parts=source.split('|');if(parts.length===3&&parts.every(v=>v&&v.length<=200))sourceCode=source;}catch{/* A malformed source cannot claim a placement. */}
  const preview=sourceCode?.split('|')[2]?.startsWith('test_')??false;
  const at=new Date(m.date*1000).toISOString(),touch=preview?undefined:await event('start',at,m.from.id,sourceCode,salt,placements);
  const key=(await sha256('menu|'+userKey+'|'+(sourceCode??''))).slice(0,24);
  return {touch,preview,menu:{key,userKey,sourceCode,preview},chatId:m.chat.id,text:(preview?'Тестовый вход: события не попадут в рабочую воронку.\n\n':'')+config.welcome,keyboard:{inline_keyboard:[[{text:'Перейти к покупке',callback_data:'buy:'+key}]]}};
 }
 if(c&&c.message?.chat.type==='private'&&!c.from.is_bot){
  const userKey=await telegramUserKey(salt,c.from.id),data=c.data??'';let menu:BotMenu|null=null;
  if(/^buy:[a-f0-9]{24}$/.test(data))menu=await options.lookupMenu(data.slice(4));
  else if(data==='payment'||/^payment:[a-f0-9]{16}$/.test(data)){const sourceCode=await options.legacySource?.(data.slice(8),userKey)??null;menu={userKey,sourceCode,preview:false};}
  else return {callbackId:c.id};
  if(!menu||menu.userKey!==userKey)return {callbackId:c.id,chatId:c.message.chat.id,text:'Откройте свою рекламную ссылку и нажмите Start: эта кнопка не связана с вашим входом.'};
  return {callbackId:c.id,chatId:c.message.chat.id,preview:menu.preview,touch:menu.preview?undefined:await event('payment_click',options.receivedAt,c.from.id,menu.sourceCode,salt,placements),text:'Для оформления курса напишите менеджеру. Нажатие этой кнопки не является оплатой.',keyboard:{inline_keyboard:[[{text:'Написать менеджеру',url:config.managerUrl}]]}};
 }
 return {};
}
async function event(type:string,at:string,id:number,source:string|null,salt:string,placements:Placement[]){
 const fields=[at,String(id),'',type,source??'',...(source?.split('|')??['','',''])];
 const csv=BOT_HEADERS.join(',')+'\n'+fields.map(v=>'"'+v.replaceAll('"','""')+'"').join(',');
 const result=await normalizeBotCsv(csv,'UTC',salt,placements);if(result.errors.length)throw new Error(result.errors[0]);
 const touch=result.events[0];if(touch)touch.botImportId='telegram_webhook';return touch;
}
