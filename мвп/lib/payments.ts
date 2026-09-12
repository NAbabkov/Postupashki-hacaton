import {normalizeWorkspace}from './funnel-data';
import {botTimestamp}from './bot-import';
import type {Payment,Workspace}from './types';
export interface PaymentInput {id:string;mode:'demo'|'live';purchaseIntentId?:string|null;userKey?:string|null;unknown?:boolean;course:string;amount:number;at:string;}
export class PaymentError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export function confirmedPayment(input:Workspace,v:PaymentInput,source='manual_manager'):Payment{
 const data=normalizeWorkspace(input);
 if(!v||!['demo','live'].includes(v.mode)||typeof v.id!=='string'||!v.id.trim()||v.id.trim().length>100||!Number.isFinite(v.amount)||v.amount<=0||!Number.isSafeInteger(Math.round(v.amount*100))||Math.abs(v.amount*100-Math.round(v.amount*100))>1e-6||!data.courses.includes(v.course))throw new PaymentError('Проверьте ID, курс и положительную сумму с точностью до копейки.');
 if(typeof v.at!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(v.at))throw new PaymentError('Укажите дату оплаты с часовым поясом.');
 let at:string;try{at=botTimestamp(v.at,'');}catch{throw new PaymentError('Неверная дата оплаты.');}
 const id=v.id.trim();if(data.payments.some(p=>p.id===id))throw new PaymentError('Payment ID уже существует; повтор не добавлен.',409);
 const intent=v.purchaseIntentId?data.purchaseIntents!.find(i=>i.id===v.purchaseIntentId&&i.mode===v.mode):null;
 if(v.purchaseIntentId&&!intent)throw new PaymentError('Заявка не найдена в выбранном режиме.');
 if(intent){if(v.unknown||(v.userKey!==undefined&&v.userKey!==intent.userKey))throw new PaymentError('Пользователь оплаты не соответствует заявке.');if(intent.course&&intent.course!==v.course)throw new PaymentError('Выбранная заявка относится к другому курсу.');if(at<intent.occurredAt)throw new PaymentError('Оплата не может предшествовать выбранной заявке.');}
 else if(v.unknown!==true||v.userKey)throw new PaymentError('Выберите заявку или явно «Источник неизвестен / вне бота».');
 return {id,mode:v.mode,userId:intent?'bot_'+intent.userKey:'outside_'+id,userKey:intent?.userKey??null,purchaseIntentId:intent?.id??null,course:v.course,amount:Math.round(v.amount*100)/100,at,status:'paid',refundAmount:0,source:v.mode==='demo'?'synthetic_demo':source};
}
export function refundPayment(data:Workspace,id:string,amount:number):Payment{
 const p=data.payments.find(p=>p.id===id&&p.mode!=='historical');
 if(!p||!Number.isFinite(amount)||amount<0||amount>p.amount||Math.abs(amount*100-Math.round(amount*100))>1e-6)throw new PaymentError('Возврат должен быть от 0 до суммы оплаты, с точностью до копейки.');
 return {...p,refundAmount:Math.round(amount*100)/100,status:amount===p.amount?'refunded':'paid'};
}
