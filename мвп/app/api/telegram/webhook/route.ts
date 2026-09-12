import {runtimeVars} from '@/lib/auth';
import {limitedBody} from '@/lib/request-limit';
import {webhookSecretMatches} from '@/lib/telegram-core';
import type {TelegramUpdate} from '@/lib/telegram-core';
import {processTelegramUpdate} from '@/lib/telegram-runtime';
export async function POST(req:Request){
 if(!await webhookSecretMatches(runtimeVars().TELEGRAM_WEBHOOK_SECRET??'',req.headers.get('X-Telegram-Bot-Api-Secret-Token')??''))return new Response(null,{status:403});
 let update:TelegramUpdate;try{update=JSON.parse(new TextDecoder().decode(await limitedBody(req,32768)));if(!Number.isSafeInteger(update?.update_id)||update.update_id<0)throw new Error();}catch{return new Response(null,{status:400});}
 try{return await result(update);}catch{return Response.json({error:'Обработка Telegram временно недоступна.'},{status:503});}
}
async function result(update:TelegramUpdate){const ok=await processTelegramUpdate(update);return Response.json({ok},{status:ok?200:503,headers:{'Cache-Control':'no-store'}});}
