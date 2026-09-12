import type {Placement} from './types';
export const inPublicationWindow=(p:Placement,at:number)=>at>=Date.parse(p.startsAt)-15*60000&&at<=Date.parse(p.startsAt)+120*60000;
export function publicationStatus(p:Placement,now=Date.now()){
 if(p.status==='cancelled')return 'Отменено';
 if(p.mode==='historical'||p.postUrl&&p.publishedAt)return 'Опубликовано';
 if(p.mode==='demo'&&p.status==='published')return 'Опубликовано';
 if(!p.linkIssuedAt)return 'Нужна ссылка';
 if(now<Date.parse(p.startsAt)-15*60000)return 'Запланировано';
 if(inPublicationWindow(p,now))return 'Ожидает публикации';
 return 'Не найден автоматически';
}
export function pendingPublication(p:Placement,now=Date.now()){return p.mode==='live'&&!!p.linkIssuedAt&&p.status!=='cancelled'&&!p.postUrl&&inPublicationWindow(p,now);}
