import {workspace,save,batchSave} from '@/lib/store';
import type {Placement,Settings,Campaign,CourseEconomics} from '@/lib/types';
import {requireAdmin,isAdmin,runtimeVars,hmac} from '@/lib/auth';
import {botReferral,channelSlug} from '@/lib/bot-referral';
import {campaigns} from '@/lib/reporting';
import {fetchPublicPosts,matchingPosts} from '@/lib/telegram-public';
import {limitedBody}from '@/lib/request-limit';
import {confirmedPayment,refundPayment,PaymentError}from '@/lib/payments';
import type {PaymentInput}from '@/lib/payments';
export async function GET(req:Request){const data=await workspace(),admin=await isAdmin(req);data.integration!.isAdmin=admin;
 if(!admin){const salt=runtimeVars().BOT_IMPORT_SALT??runtimeVars().ADMIN_WRITE_SECRET??'public-anonymous-view';const ids=new Map<string,string>();const anonym=async(id:string)=>{if(!ids.has(id))ids.set(id,'anon_'+await hmac(salt,id));return ids.get(id)!;};
  for(const l of data.leads.filter(l=>l.mode==='live')){l.userId=await anonym(l.userId);l.note='';l.owner='';}
  for(const p of data.payments.filter(p=>p.mode==='live')){p.userId=await anonym(p.userId);p.source='Подтверждённая запись команды';}
  for(const e of data.events.filter(e=>e.mode==='live')){e.userId=await anonym(e.userId);delete e.botUserKey;}
 }
 data.leads=[];
 return Response.json(data,{headers:{'Cache-Control':'no-store','Vary':'Cookie'}});}
const fail=(message:string,status=400)=>Response.json({error:message},{status});
const validDate=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const short=(v:unknown,max=250)=>typeof v==='string'&&v.length<=max;
export async function POST(req:Request){
 const denied=await requireAdmin(req);if(denied)return denied;
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return fail('Недопустимый источник запроса',403);
 if(Number(req.headers.get('content-length')??0)>200000)return fail('Слишком большой запрос',413);
 try{
  const body=JSON.parse(new TextDecoder().decode(await limitedBody(req,200000))) as {action:string;value:unknown},data=await workspace();if(!body||typeof body!=='object')return fail('Некорректный запрос');if(!data.integration?.databaseReady)return fail('База не готова. Примените миграцию; изменения не сохранены.',503);
  if(body.action==='placement'){
   const p=body.value as Placement&{campaignName?:string};
   if(!p||!short(p.id,64)||!/^[A-Za-z0-9_-]{1,64}$/.test(p.id)||!short(p.campaignId,80)||!p.campaignId||!short(p.title)||!p.title.trim()||!short(p.channel,100)||!validDate(p.startsAt)||!Array.isArray(p.courses)||!p.courses.length||!p.courses.every(c=>data.courses.includes(c))||!['demo','live'].includes(p.mode)||!(p.cost===null||(Number.isFinite(p.cost)&&p.cost>=0))||!short(p.text,20000))return fail('Укажите название, кампанию, канал, хотя бы один курс, дату и неотрицательный бюджет.');
   const channel='@'+channelSlug(p.channel);
   if(new Set(p.courses).size!==p.courses.length)return fail('Курс указан несколько раз.');
   const old=data.placements.find(v=>v.id===p.id);if(old?.mode==='historical'||old&&old.mode!==p.mode)return fail('Историю и тип размещения нельзя изменять.');
   if(old?.linkIssuedAt&&(old.channel!==channel||old.campaignId!==p.campaignId||JSON.stringify([...old.courses].sort())!==JSON.stringify([...p.courses].sort())))return fail('Ссылка уже выпущена. Для другой кампании, канала или набора курсов создайте новое размещение.');
   if(old?.postUrl&&old.startsAt!==p.startsAt)return fail('У опубликованного размещения нельзя менять плановую дату.');
   const exists=campaigns(data,p.mode).some(c=>c.id===p.campaignId);
   if(!exists&&(!short(p.campaignName)||!p.campaignName?.trim()))return fail('Выберите кампанию или явно создайте новую с названием.');
   if(exists&&p.campaignName!==undefined)return fail('Для существующей кампании не передавайте название новой.');
   const saved:Placement={id:p.id,campaignId:p.campaignId,mode:p.mode,title:p.title.trim(),channel,startsAt:p.startsAt,endsAt:new Date(Date.parse(p.startsAt)+3600000).toISOString(),courses:p.courses,cost:p.cost,text:p.text,match:'explicit',tags:old?.tags??[],status:old?.status??'planned',owner:old?.owner??'',note:old?.note??'',postUrl:old?.postUrl??'',evidence:old?.evidence??'',originUrl:old?.originUrl??'',paidStatus:old?.paidStatus??'unknown',promoCode:old?.promoCode??'',courseShares:old?.courseShares};
   for(const field of ['linkIssuedAt','botTrackingKey','botSourceCode','botStartParam','publishedAt','publicationDetectedAt','publicationDetection','lastPublicationCheckAt','lastPublicationCheckError'] as const)if(old?.[field]!==undefined)Object.assign(saved,{[field]:old[field]});
   await batchSave([{kind:'placement',value:saved},...(!exists?[{kind:'campaign' as const,value:{id:p.campaignId,mode:p.mode,name:p.campaignName!.trim(),goal:'Продажа курса',owner:'',extraCost:null,estimatedAdCost:null}}]:[])],true);
  }else if(body.action==='issue_link'){
   const id=(body.value as {id?:string})?.id,p=data.placements.find(p=>p.id===id&&p.mode!=='historical');
   if(!p||p.status==='cancelled')return fail('Выберите новое или демо-размещение, которое не отменено.');
   const r=await botReferral(p,data.settings.botUsername);
   if(data.placements.some(q=>q.id!==p.id&&q.botTrackingKey===r.botTrackingKey))return fail('Конфликт ключа размещения. Создайте новое размещение.');
   const issued={...p,linkIssuedAt:p.linkIssuedAt??new Date().toISOString(),botTrackingKey:r.botTrackingKey,botSourceCode:r.botSourceCode,botStartParam:r.botStartParam};
   await save('placement',issued);
   return Response.json({ok:true,placement:issued,path:'/r/'+issued.id});
  }else if(body.action==='cancel_placement'){
   const p=data.placements.find(p=>p.id===(body.value as {id:string})?.id&&p.mode!=='historical');if(!p)return fail('Размещение не найдено.');await save('placement',{...p,status:'cancelled'});
  }else if(body.action==='manual_publication'){
   const v=body.value as {id:string;postUrl:string;publishedAt?:string},p=data.placements.find(p=>p.id===v?.id&&p.mode==='live'&&p.linkIssuedAt&&p.status!=='cancelled');
   if(!p||p.postUrl||Date.now()<=Date.parse(p.startsAt)+7200000)return fail('Ручной ввод доступен, когда пост не найден после рабочего окна.');
   const m=/^https:\/\/t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})\/(\d+)$/.exec(v.postUrl??'');if(!m||m[1].toLowerCase()!==channelSlug(p.channel))return fail('Укажите адрес поста выбранного канала.');
   let verified=false,at=v.publishedAt??p.startsAt;if(!validDate(at))return fail('Неверная дата публикации.');
   try{const posts=await fetchPublicPosts(p.channel,Number(m[2])+1),post=posts.find(post=>post.postUrl.toLowerCase()===v.postUrl.toLowerCase());if(post){if(!matchingPosts([post],p,runtimeVars().PUBLIC_APP_URL!).length)return fail('В публичном посте не найдена точная ссылка или дата вне окна.');verified=true;at=post.at;}}catch{/* Valid private/unavailable posts retain an explicit manual basis. */}
   const latest=(await workspace()).placements.find(q=>q.id===p.id)!;if(latest.status==='cancelled'||latest.postUrl)return fail('Размещение уже изменено. Обновите страницу.',409);
   await save('placement',{...latest,status:'published',postUrl:v.postUrl,publishedAt:at,publicationDetectedAt:new Date().toISOString(),publicationDetection:verified?'manual_verified':'manual',lastPublicationCheckError:''});
  }else if(body.action==='new_lead'||body.action==='lead'||body.action==='demo'){
   return fail('CRM и ручные лиды удалены. Заявка появляется из payment_click; оплату зарегистрируйте отдельно.',410);
  }else if(body.action==='payment'){
   const p=confirmedPayment(data,body.value as PaymentInput),r=await batchSave([{kind:'payment',value:p}]);
   if(!r[0].meta.changes)return fail('Payment ID уже существует.',409);
  }else if(body.action==='refund'){
   const v=body.value as {id:string;amount:number};await save('payment',refundPayment(data,v?.id,v?.amount));
  }else if(body.action==='campaign'){
   const c=body.value as Campaign;
   if(!c||!short(c.id,100)||!short(c.name)||!c.name.trim()||!short(c.goal,500)||!short(c.owner,100)||!['historical','demo','live'].includes(c.mode)||![c.extraCost,c.estimatedAdCost].every(v=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0)))return fail('Проверьте кампанию и неотрицательные расходы.');
   await save('campaign',c);
  }else if(body.action==='economics'){
   const e=body.value as CourseEconomics,old=data.economics?.find(v=>v.id===e?.id);
   if(!e||!short(e.id,150)||!data.courses.includes(e.course)||!['historical','demo','live'].includes(e.mode)||![e.deliveryPercent,e.feePercent].every(v=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))||!(e.perSaleCost===null||(Number.isFinite(e.perSaleCost)&&e.perSaleCost>=0))||(old&&(old.mode!==e.mode||old.course!==e.course)))return fail('Проверьте курс, проценты 0–100 и неотрицательную себестоимость.');
   await save('economics',e);
  }else if(body.action==='settings'){
   const s=body.value as Settings;
   if(!s||!['botUsername','managerUsername','mainChannel'].every(k=>short(s[k as keyof Settings],64)&&(!s[k as keyof Settings]||/^[A-Za-z][A-Za-z0-9_]{4,63}$/.test(s[k as keyof Settings]))))return fail('Введите username без @, ссылки и пробелов.');
   await save('settings',s);
  }else return fail('Неизвестное действие.');
  return Response.json({ok:true});
 }catch(e){return fail(e instanceof Error?e.message:'Ошибка сохранения',e instanceof PaymentError?e.status:500);}
}
