import {requireAdmin,runtimeVars} from '@/lib/auth';
import {limitedBody} from '@/lib/request-limit';
import {getBotConfig,putBotConfig,telegramApi} from '@/lib/telegram-runtime';
import {validateBotConfig} from '@/lib/telegram-core';
interface Me {username:string;}
interface Hook {url:string;pending_update_count:number;last_error_message?:string;}
export async function GET(req:Request){const denied=await requireAdmin(req);if(denied)return denied;try{
 const config=await getBotConfig(),configured=!!runtimeVars().TELEGRAM_BOT_TOKEN,webhookUrl=(runtimeVars().PUBLIC_APP_URL??'')+'/api/telegram/webhook';
 if(!configured)return Response.json({configured,config,webhookUrl},{headers:{'Cache-Control':'no-store'}});
 const [me,hook]=await Promise.all([telegramApi<Me>('getMe'),telegramApi<Hook>('getWebhookInfo')]);
 return Response.json({configured,config,username:me.username,connected:config.enabled&&hook.url===webhookUrl,pending:hook.pending_update_count,lastError:hook.last_error_message?.replaceAll(runtimeVars().TELEGRAM_BOT_TOKEN!,'[скрыто]')??null,webhookUrl:hook.url},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Ошибка бота.'},{status:503});}}
export async function POST(req:Request){const denied=await requireAdmin(req);if(denied)return denied;try{
 const body=JSON.parse(new TextDecoder().decode(await limitedBody(req,4096))),config=await getBotConfig();
 if(body.action==='save')await putBotConfig({...config,...validateBotConfig(body)});
 else if(body.action==='enable'){
  const vars=runtimeVars(),me=await telegramApi<Me>('getMe');if(me.username.toLowerCase()!==(vars.TELEGRAM_BOT_USERNAME??'tracker_marketing_bot').toLowerCase())throw new Error('Токен относится к другому боту.');
  if(!vars.TELEGRAM_WEBHOOK_SECRET||vars.TELEGRAM_WEBHOOK_SECRET.length<32||!vars.PUBLIC_APP_URL?.startsWith('https://'))throw new Error('Webhook пока не настроен на сервере.');
  await putBotConfig({...config,enabled:true});try{await telegramApi('setWebhook',{url:vars.PUBLIC_APP_URL+'/api/telegram/webhook',secret_token:vars.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','callback_query'],max_connections:2,drop_pending_updates:false});}catch(e){await putBotConfig(config);throw e;}
 }else if(body.action==='pause'){await telegramApi('deleteWebhook',{drop_pending_updates:false});await putBotConfig({...config,enabled:false});}
 else throw new Error('Неизвестное действие.');
 return Response.json({ok:true,config:await getBotConfig()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Не удалось изменить бота.'},{status:400});}}
