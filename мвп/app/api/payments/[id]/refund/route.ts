import {requireAdmin}from '@/lib/auth';
import {workspace,save}from '@/lib/store';
import {refundPayment,PaymentError}from '@/lib/payments';
import {limitedBody}from '@/lib/request-limit';
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const denied=await requireAdmin(req);if(denied)return denied;
 try{const data=await workspace();if(!data.integration?.databaseReady)return Response.json({error:'Хранилище недоступно.'},{status:503});
  const {id}=await params,{amount}=JSON.parse(new TextDecoder().decode(await limitedBody(req,4000))) as {amount:number};const p=refundPayment(data,id,amount);await save('payment',p);return Response.json({ok:true,payment:p});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Ошибка возврата.'},{status:e instanceof PaymentError?e.status:400});}
}
