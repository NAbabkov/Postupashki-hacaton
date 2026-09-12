import {workspace,batchSave,save}from '@/lib/store';
import {env}from 'cloudflare:workers';
import type{Payment}from '@/lib/types';
export async function POST(req:Request){
 const key=(env as unknown as Record<string,string|undefined>).INGEST_KEY;
 if(!key||req.headers.get('authorization')!=='Bearer '+key)return Response.json({error:'Unauthorized'},{status:401});
 if(Number(req.headers.get('content-length')??0)>100000)return Response.json({error:'Too large'},{status:413});
 try{
  const body=await req.json() as {type:string;lead_id:string;payment_id:string;course:string;amount:number;at:string};
  if(body.type==='payment'){
   const data=await workspace(),lead=data.leads.find(l=>l.mode==='live'&&l.id===body.lead_id);
   if(!lead)return Response.json({error:'Неизвестный lead_id; сопоставление не выполняется по догадке.'},{status:400});
   if(typeof body.payment_id!=='string'||body.payment_id.length<1||body.payment_id.length>100||!data.courses.includes(body.course)||!Number.isFinite(body.amount)||body.amount<=0||typeof body.at!=='string'||!Number.isFinite(Date.parse(body.at))||!/(Z|[+-]\d\d:\d\d)$/.test(body.at))return Response.json({error:'Некорректная оплата: ID, курс, сумма и время с часовым поясом обязательны.'},{status:400});
   if(lead.course&&lead.course!==body.course)return Response.json({error:'Курс оплаты не соответствует заявке.'},{status:400});
   const id='livepay_'+body.payment_id,old=data.payments.find(p=>p.id===id);
   if(old){if(old.userId!==lead.userId||old.amount!==body.amount||old.course!==body.course)return Response.json({error:'Конфликт повторного payment_id'},{status:409});return Response.json({ok:true,duplicate:true});}
   const p:Payment={id,mode:'live',userId:lead.userId,course:body.course,amount:body.amount,at:body.at,leadId:lead.id,source:'trusted manager/CRM ingress',status:'paid'};
   await batchSave([{kind:'payment',value:p}]);await save('lead',{...lead,course:body.course,stage:'paid'});
   return Response.json({ok:true});
  }
  return Response.json({error:'Неизвестный тип события'},{status:400});
 }catch{return Response.json({error:'Не удалось обработать событие; проверьте схему и серверные ключи.'},{status:500});}
}
