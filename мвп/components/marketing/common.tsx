'use client';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {csv} from '@/lib/attribution';
export const money=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n)+' ₽';
export const number=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n);
export function Picker({value,onChange,items,label}:{value:string;onChange:(v:string)=>void;items:{value:string;label:string}[];label?:string}){
 return <label className="field">{label&&<span>{label}</span>}<Select value={value} onValueChange={v=>{if(v!==null)onChange(String(v));}}><SelectTrigger className="min-w-[130px] h-10"><SelectValue>{items.find(i=>i.value===value)?.label??value}</SelectValue></SelectTrigger><SelectContent>{items.map(i=><SelectItem value={i.value} key={i.value}>{i.label}</SelectItem>)}</SelectContent></Select></label>;
}
export function download(name:string,rows:object[]){const url=URL.createObjectURL(new Blob([csv(rows as Record<string,unknown>[])],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
export const modes=[{value:'historical',label:'История кейса'},{value:'demo',label:'Синтетическое демо'},{value:'live',label:'Новые реальные данные'}];
export const statuses=[{value:'planned',label:'Запланировано'},{value:'ready',label:'Готово к публикации'},{value:'published',label:'Опубликовано'},{value:'cancelled',label:'Отменено'}];

export function ModeBadge({mode}:{mode:string}){return <span className={'pill '+(mode==='historical'?'blue':mode==='demo'?'purple':'green')}>{mode==='historical'?'Из Telegram':mode==='demo'?'Синтетика':'Новые данные'}</span>;}
export function ModeNote({mode}:{mode:string}){return <div className="info-strip mode-banner"><p>{mode==='historical'?'Оценка по публикациям и времени. Источник конкретного покупателя неизвестен; суммы из кейса частично приближены.':mode==='demo'?'Весь сценарий вымышлен: размещения, касания, пользователи, расходы и оплаты. Его результаты демонстрируют механику.':'Сайт считает переходы; CSV бота — запуски и переходы к покупке. Оплата подтверждается отдельно. Браузер и Telegram ID не соединяются автоматически.'}</p></div>;}
