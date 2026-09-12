import {runtimeVars} from './auth';
import {binding,save,workspace} from './store';
import {DEFAULT_BOT_CONFIG,planTelegramUpdate} from './telegram-core';
import type {BotConfig,BotMenu,TelegramUpdate} from './telegram-core';
import {sha256} from './bot-referral';
export async function getBotConfig():Promise<BotConfig>{const row=await binding().prepare('SELECT payload FROM bot_runtime WHERE key=?').bind('config').first<{payload:string}>();return {...DEFAULT_BOT_CONFIG,...(row?JSON.parse(row.payload):{})};}
export async function putBotConfig(config:BotConfig){await binding().prepare('INSERT INTO bot_runtime (key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').bind('config',JSON.stringify({...config,updatedAt:new Date().toISOString()})).run();}
export async function telegramApi<T>(method:string,body:object={}):Promise<T>{
 const token=runtimeVars().TELEGRAM_BOT_TOKEN;if(!token)throw new Error('Токен бота не настроен на сервере.');
 let response:Response;try{response=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});}catch{throw new Error('Telegram API недоступен. Повторите попытку.');}
 const result=await response.json() as {ok:boolean;result:T;error_code?:number};if(!response.ok||!result.ok)throw new Error('Telegram отклонил '+method+' (код '+(result.error_code??response.status)+').');return result.result;
}
export async function processTelegramUpdate(update:TelegramUpdate){
 const db=binding(),config=await getBotConfig();if(!config.enabled)return false;
 const id=String(update.update_id),now=new Date().toISOString();
 await db.prepare('INSERT OR IGNORE INTO telegram_updates (id,created_at,updated_at) VALUES (?,?,?)').bind(id,now,now).run();
 const row=await db.prepare('SELECT status,created_at FROM telegram_updates WHERE id=?').bind(id).first<{status:string;created_at:string}>();if(row?.status==='done')return true;
 const claim=await db.prepare("UPDATE telegram_updates SET status='processing',updated_at=? WHERE id=? AND status!='done' AND (status!='processing' OR updated_at<?)").bind(now,id,new Date(Date.now()-60000).toISOString()).run();if(!claim.meta.changes)return false;
 try{
  const data=await workspace(),salt=runtimeVars().BOT_IMPORT_SALT??'';
  const plan=await planTelegramUpdate(update,{salt,placements:data.placements,config,receivedAt:row!.created_at,lookupMenu:async key=>{const row=await db.prepare('SELECT payload FROM bot_runtime WHERE key=?').bind('menu:'+key).first<{payload:string}>();return row?JSON.parse(row.payload) as BotMenu:null;},legacySource:async(fingerprint,userKey)=>{for(const p of data.placements.filter(p=>p.mode==='live'&&p.botSourceCode)){if((await sha256(p.botSourceCode!)).slice(0,16)===fingerprint&&data.botEvents?.some(e=>e.eventType==='start'&&e.userKey===userKey&&e.sourceCode===p.botSourceCode))return p.botSourceCode!;}return null;}});
  if(plan.menu){const {key,...value}=plan.menu;await db.prepare('INSERT OR IGNORE INTO bot_runtime (key,payload) VALUES (?,?)').bind('menu:'+key,JSON.stringify(value)).run();}
  if(plan.touch)await save('event',plan.touch,false);
  if(plan.callbackId)try{await telegramApi('answerCallbackQuery',{callback_query_id:plan.callbackId});}catch{/* Old callback acknowledgements can expire; recorded intent remains valid. */}
  if(plan.chatId&&plan.text)await telegramApi('sendMessage',{chat_id:plan.chatId,text:plan.text,reply_markup:plan.keyboard});
  await db.prepare("UPDATE telegram_updates SET status='done',updated_at=? WHERE id=?").bind(new Date().toISOString(),id).run();return true;
 }catch(error){await db.prepare("UPDATE telegram_updates SET status='failed',updated_at=? WHERE id=?").bind(new Date().toISOString(),id).run();throw error;}
}
