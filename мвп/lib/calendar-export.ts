import type {Placement,Workspace} from './types';
import {botFunnel} from './bot-funnel';
import {placementUrl} from './bot-referral';
import {publicationStatus} from './publication-status';
export const CALENDAR_HEADERS=['ID размещения','Тип данных','Кампания','Канал','Курсы','Плановая дата UTC','Публикация UTC','Статус','Бюджет, ₽','Пост в Telegram','Ссылка размещения','Web-переходы','Запустили бота, чел.','Перешли к покупке, чел.','Конверсия в переход к покупке, %','Подтверждённые оплаты, шт.','Выручка после возвратов, ₽'];
function quote(value:unknown){let text=typeof value==='string'?value:typeof value==='number'?String(value):'';if(typeof value==='string'&&/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function excelCsv(rows:unknown[][]){return '\uFEFF'+rows.map(row=>row.map(quote).join(';')).join('\r\n')+'\r\n';}
export function calendarCsv(data:Workspace,placements:Placement[],origin:string,financial:(p:Placement)=>{payments:number;revenue:number},now=Date.now()){
 const rows=placements.map(p=>{const f=botFunnel(data,[p.id]),r=financial(p);return [p.id,p.mode==='historical'?'История':p.mode==='demo'?'Демо':'Новые данные',data.campaigns?.find(c=>c.id===p.campaignId&&c.mode===p.mode)?.name??p.title,p.channel,p.courses.join(', '),p.startsAt,p.publishedAt??(p.mode==='historical'?p.startsAt:''),publicationStatus(p,now),p.cost===null?'':p.cost.toFixed(2).replace('.',','),p.postUrl,p.linkIssuedAt&&p.mode!=='historical'?placementUrl(origin,p.id):'',p.mode==='historical'?'':f.webClicks,p.mode==='historical'?'':f.uniqueStarters,p.mode==='historical'?'':f.uniqueIntentUsers,f.conversion===null?'':f.conversion.toFixed(1).replace('.',','),p.mode==='historical'?'':r.payments,p.mode==='historical'?'':r.revenue.toFixed(2).replace('.',',')];});
 return excelCsv([CALENDAR_HEADERS,...rows]);
}
