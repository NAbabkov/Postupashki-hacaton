import {workspace,save,batchSave} from '@/lib/store';
import type {Placement,Payment,Lead,Touch,Settings,Campaign,CourseEconomics} from '@/lib/types';
export async function GET(){return Response.json(await workspace(),{headers:{'Cache-Control':'no-store'}});}
const fail=(message:string,status=400)=>Response.json({error:message},{status});
const validDate=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const short=(v:unknown,max=250)=>typeof v==='string'&&v.length<=max;
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return fail('Недопустимый источник запроса',403);
 if(Number(req.headers.get('content-length')??0)>200000)return fail('Слишком большой запрос',413);
 try{
  const body=await req.json() as {action:string;value:unknown},data=await workspace();if(!body||typeof body!=='object')return fail('Некорректный запрос');if(!data.integration?.databaseReady)return fail('База не готова. Примените миграцию; изменения не сохранены.',503);
  if(body.action==='placement'){
   const p=body.value as Placement&{campaignName?:string};
   if(!p||!short(p.id,80)||!short(p.campaignId,80)||!short(p.title)||!p.title.trim()||!short(p.channel,100)||!validDate(p.startsAt)||!validDate(p.endsAt)||Date.parse(p.endsAt)<Date.parse(p.startsAt)||!Array.isArray(p.courses)||!p.courses.every(c=>data.courses.includes(c))||!['demo','live'].includes(p.mode)||!['planned','ready','published','cancelled'].includes(p.status)||!(p.cost===null||(Number.isFinite(p.cost)&&p.cost>=0))||!short(p.text,20000)||!short(p.owner,100)||!short(p.note,2000)||!short(p.postUrl,500))return fail('Проверьте название, даты, курс и неотрицательную стоимость.');
   if(new Set(p.courses).size!==p.courses.length)return fail('Курс указан несколько раз.');
   if(p.courseShares&&(!p.courses.length||Object.keys(p.courseShares).some(k=>!p.courses.includes(k))||p.courses.some(c=>!Number.isFinite(p.courseShares?.[c])||p.courseShares![c]<0)||Math.abs(Object.values(p.courseShares).reduce((a,b)=>a+b,0)-1)>0.001))return fail('Сумма долей расходов по курсам должна быть 100%.');
   const old=data.placements.find(v=>v.id===p.id);if(old?.mode==='historical'||(old&&old.mode!==p.mode))return fail('Исторические данные и тип события нельзя изменять.');
   if(!/^[A-Za-z0-9_-]{1,64}$/.test(p.id)||!p.campaignId.trim()||!['explicit','family_candidate','none','unknown'].includes(p.match)||!Array.isArray(p.tags)||!p.tags.every(t=>short(t,100))||!short(p.evidence,2000)||!short(p.originUrl,500)||!short(p.paidStatus,100)||!short(p.promoCode,100))return fail('Проверьте ID и описание размещения.');
   if(p.postUrl&&!/^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+$/.test(p.postUrl))return fail('Ссылка на пост должна вести на t.me/канал/номер.');
   if(p.originUrl&&!/^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+$/.test(p.originUrl))return fail('Ссылка на оригинал должна вести на t.me/канал/номер.');
   if(old&&data.events.some(e=>e.placementId===old.id)&&(old.campaignId!==p.campaignId||old.channel!==p.channel||JSON.stringify([...old.courses].sort())!==JSON.stringify([...p.courses].sort())))return fail('У размещения уже есть переходы. Для другого канала, кампании или набора курсов создайте новое размещение.');
   if(p.campaignName!==undefined&&(!short(p.campaignName)||!p.campaignName.trim()))return fail('Введите название новой кампании.');
   // Only the release action can issue a link. Editing the post keeps its address and release date.
   const {campaignName,...fields}=p,saved={...fields,linkIssuedAt:old?.linkIssuedAt};
   const exists=data.placements.some(q=>q.campaignId===p.campaignId&&q.mode===p.mode);
   await batchSave([{kind:'placement',value:saved},...(!exists&&campaignName?[{kind:'campaign' as const,value:{id:p.campaignId,mode:p.mode,name:campaignName,goal:'Продажа курса',owner:p.owner,extraCost:null,estimatedAdCost:null}}]:[])],true);
  }else if(body.action==='issue_link'){
   const id=(body.value as {id?:string})?.id,p=data.placements.find(p=>p.id===id&&p.mode!=='historical');
   if(!p||p.status==='cancelled')return fail('Выберите новое или демо-размещение, которое не отменено.');
   const issued={...p,linkIssuedAt:p.linkIssuedAt??new Date().toISOString()};
   await save('placement',issued);
   return Response.json({ok:true,placement:issued,path:'/r/'+issued.id});
  }else if(body.action==='new_lead'){
   const l=body.value as Lead;
   if(!l||!['demo','live'].includes(l.mode)||!short(l.id,100)||!short(l.userId,100)||l.stage!=='new'||!short(l.owner,100)||!short(l.note,2000)||!data.courses.includes(l.course)||!validDate(l.createdAt)||data.leads.some(v=>v.id===l.id||(v.mode===l.mode&&v.userId===l.userId&&v.course===l.course)))return fail('Некорректный новый лид.');
   const source=data.placements.find(p=>p.id===l.sourcePlacementId&&p.mode===l.mode&&p.status==='published'&&(!p.courses.length||p.courses.includes(l.course)));
   if(l.sourcePlacementId&&!source)return fail('Источник должен быть опубликованным размещением этого курса.');
   await save('lead',l,false);
   if(source)await save('event',{id:'declared_'+l.id,mode:l.mode,userId:l.userId,placementId:source.id,type:'manager_source',at:l.createdAt},false);
  }else if(body.action==='lead'){
   const l=body.value as Lead,old=data.leads.find(v=>v.id===l?.id);
   if(!old||old.mode==='historical'||!['new','contacted','qualified','paid','lost'].includes(l.stage)||!short(l.owner,100)||!short(l.note,2000)||(l.course!==''&&!data.courses.includes(l.course)))return fail('Некорректный лид.');
   if(old.course&&l.course!==old.course)return fail('Заявка уже привязана к курсу. Для другого курса создайте отдельную заявку.');
   if(l.stage==='paid'&&!data.payments.some(p=>p.userId===old.userId&&p.mode===old.mode&&p.course===l.course&&p.status==='paid'&&(p.refundAmount??0)<p.amount))return fail('Статус «Оплачен» ставится после регистрации оплаты.');
   await save('lead',{...old,stage:l.stage,owner:l.owner,note:l.note,course:l.course});
  }else if(body.action==='payment'){
   const p=body.value as Payment;
   if(!p||!['demo','live'].includes(p.mode)||!short(p.id,100)||!short(p.userId,100)||!Number.isFinite(p.amount)||p.amount<=0||!validDate(p.at)||!data.courses.includes(p.course)||!['paid','refunded'].includes(p.status)||(p.refundAmount!==undefined&&(!Number.isFinite(p.refundAmount)||p.refundAmount<0||p.refundAmount>p.amount)))return fail('Проверьте ID, курс, дату и положительную сумму оплаты.');
   if(data.payments.some(v=>v.id===p.id))return fail('Оплата с таким ID уже есть; повтор не добавлен.',409);
   const lead=data.leads.find(l=>l.mode===p.mode&&(p.leadId?l.id===p.leadId:l.userId===p.userId&&l.course===p.course));
   if(!lead||lead.userId!==p.userId||(lead.course&&lead.course!==p.course))return fail('Выберите заявку именно на оплачиваемый курс.');
   await batchSave([{kind:'payment',value:{...p,leadId:lead.id,source:p.mode==='demo'?'manual synthetic demo':'manual manager entry'}}]);
   await save('lead',{...lead,course:p.course,stage:p.status==='refunded'||p.refundAmount===p.amount?'qualified':'paid'});
  }else if(body.action==='refund'){
   const v=body.value as {id:string;amount:number},p=data.payments.find(p=>p.id===v?.id&&p.mode!=='historical');
   if(!p||!Number.isFinite(v.amount)||v.amount<0||v.amount>p.amount)return fail('Возврат должен быть от 0 до суммы оплаты.');
   await save('payment',{...p,refundAmount:v.amount,status:v.amount===p.amount?'refunded':'paid'});
   const lead=data.leads.find(l=>l.id===p.leadId||(l.mode===p.mode&&l.userId===p.userId&&l.course===p.course));
   if(lead){const hasPay=data.payments.some(q=>q.id!==p.id&&q.mode===p.mode&&q.userId===p.userId&&q.course===p.course&&q.status==='paid'&&(q.refundAmount??0)<q.amount)||v.amount<p.amount;await save('lead',{...lead,stage:hasPay?'paid':'qualified'});}
  }else if(body.action==='campaign'){
   const c=body.value as Campaign;
   if(!c||!short(c.id,100)||!short(c.name)||!c.name.trim()||!short(c.goal,500)||!short(c.owner,100)||!['historical','demo','live'].includes(c.mode)||!data.placements.some(p=>p.campaignId===c.id&&p.mode===c.mode)||![c.extraCost,c.estimatedAdCost].every(v=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0)))return fail('Проверьте кампанию и неотрицательные расходы.');
   await save('campaign',c);
  }else if(body.action==='economics'){
   const e=body.value as CourseEconomics,old=data.economics?.find(v=>v.id===e?.id);
   if(!e||!short(e.id,150)||!data.courses.includes(e.course)||!['historical','demo','live'].includes(e.mode)||![e.deliveryPercent,e.feePercent].every(v=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))||!(e.perSaleCost===null||(Number.isFinite(e.perSaleCost)&&e.perSaleCost>=0))||(old&&(old.mode!==e.mode||old.course!==e.course)))return fail('Проверьте курс, проценты 0–100 и неотрицательную себестоимость.');
   await save('economics',e);
  }else if(body.action==='settings'){
   const s=body.value as Settings;
   if(!s||!['botUsername','managerUsername','mainChannel'].every(k=>short(s[k as keyof Settings],64)&&(!s[k as keyof Settings]||/^[A-Za-z][A-Za-z0-9_]{4,63}$/.test(s[k as keyof Settings]))))return fail('Введите username без @, ссылки и пробелов.');
   await save('settings',s);
  }else if(body.action==='demo'){
   const pid=(body.value as {placementId?:string})?.placementId;
   const p=data.placements.find(v=>v.id===pid&&v.mode==='demo'&&v.status==='published');
   if(!p)return fail('Выберите опубликованное синтетическое размещение.');
   const id=crypto.randomUUID().replaceAll('-','').slice(0,12),userId='demo_live_'+id,at=new Date(Date.parse(p.startsAt)+3600000).toISOString();
   const events:Touch[]=[{id:'demo_click_'+id,mode:'demo',userId,placementId:p.id,type:'visit',at,clickId:id},{id:'demo_start_'+id,mode:'demo',userId,placementId:p.id,type:'lead',at:new Date(Date.parse(at)+60000).toISOString(),clickId:id}];
   const lead:Lead={id:'demo_lead_'+id,mode:'demo',userId,stage:'new',owner:'',course:p.courses[0]??data.courses[0],sourcePlacementId:p.id,note:'Создано кнопкой демо; все события синтетические.',createdAt:at};
   await batchSave([...events.map(value=>({kind:'event' as const,value})),{kind:'lead',value:lead}]);
   return Response.json({ok:true,userId,leadId:lead.id});
  }else return fail('Неизвестное действие.');
  return Response.json({ok:true});
 }catch(e){return fail(e instanceof Error?e.message:'Ошибка сохранения',500);}
}
