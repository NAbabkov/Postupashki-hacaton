import {requireAdmin}from '@/lib/auth';
import {workspace,batchSave}from '@/lib/store';
import {confirmedPayment,PaymentError}from '@/lib/payments';
import type {PaymentInput}from '@/lib/payments';
import {limitedBody}from '@/lib/request-limit';
export async function POST(req:Request){
 const denied=await requireAdmin(req);if(denied)return denied;
 try{const data=await workspace();if(!data.integration?.databaseReady)return Response.json({error:'Хранилище недоступно.'},{status:503});
  const p=confirmedPayment(data,JSON.parse(new TextDecoder().decode(await limitedBody(req,16000))) as PaymentInput),r=await batchSave([{kind:'payment',value:p}]);
  if(!r[0].meta.changes)return Response.json({error:'Payment ID уже существует.'},{status:409});
  return Response.json({ok:true,payment:p},{status:201});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Ошибка регистрации.'},{status:e instanceof PaymentError?e.status:400});}
}
