import {workspace,batchSave}from '@/lib/store';
import {runtimeVars,hmac}from '@/lib/auth';
import {confirmedPayment,PaymentError}from '@/lib/payments';
import {limitedBody}from '@/lib/request-limit';
export async function POST(req:Request){
 const key=runtimeVars().INGEST_KEY,provided=req.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 if(!key||!provided||await hmac(key,provided)!==await hmac(key,key))return Response.json({error:'Unauthorized'},{status:401});
 try{const b=JSON.parse(new TextDecoder().decode(await limitedBody(req,16000))) as {type:string;purchase_intent_id:string;payment_id:string;course:string;amount:number;at:string};
  if(b.type!=='payment')return Response.json({error:'Поддерживается только подтверждённая payment.'},{status:400});
  const data=await workspace();if(!data.integration?.databaseReady)return Response.json({error:'Хранилище недоступно.'},{status:503});
  const old=data.payments.find(p=>p.id===b.payment_id);if(old){if(old.mode!=='live'||old.purchaseIntentId!==b.purchase_intent_id||old.amount!==b.amount||old.course!==b.course)return Response.json({error:'Конфликт payment_id'},{status:409});return Response.json({ok:true,duplicate:true});}
  const p=confirmedPayment(data,{id:b.payment_id,mode:'live',purchaseIntentId:b.purchase_intent_id,course:b.course,amount:b.amount,at:b.at},'payment_import');
  const r=await batchSave([{kind:'payment',value:p}]);return Response.json({ok:true,duplicate:!r[0].meta.changes});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Ошибка оплаты.'},{status:e instanceof PaymentError?e.status:400});}
}
