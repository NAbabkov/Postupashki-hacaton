'use client';
import {useState}from 'react';
import {ExternalLink,Link2}from 'lucide-react';
import {toast}from 'sonner';
import {Button}from '@/components/ui/button';
import {Input}from '@/components/ui/input';
import {publicationStatus}from '@/lib/publication-status';
import {placementUrl}from '@/lib/bot-referral';
import type{Placement}from '@/lib/types';
export default function PlacementLink({placement:p,mutate,origin,admin}:{placement:Placement;mutate:(a:string,v:unknown)=>Promise<unknown>;origin:string;admin:boolean}){
 const[postUrl,setPostUrl]=useState(''),[publishedAt,setPublishedAt]=useState(p.startsAt.slice(0,16)),[busy,setBusy]=useState(false);
 if(p.mode==='historical')return null;
 const url=origin?placementUrl(origin,p.id):'',status=publicationStatus(p);
 async function issue(){setBusy(true);try{await mutate('issue_link',{id:p.id});}catch{}finally{setBusy(false);}}
 async function attach(e:React.SyntheticEvent<HTMLFormElement>){e.preventDefault();setBusy(true);try{await mutate('manual_publication',{id:p.id,postUrl,publishedAt:publishedAt+':00Z'});}catch{}finally{setBusy(false);}}
 async function copy(){try{await navigator.clipboard.writeText(url);toast.success('Ссылка скопирована');}catch{toast.error('Не удалось скопировать. Выделите полный адрес.');}}
 return <section className="placement-link-box"><div className="panel-header"><div><h3>Ссылка размещения</h3><p>Один пост → одна ссылка → источник в боте</p></div><span className={'pill '+(p.status==='cancelled'?'neutral':p.linkIssuedAt?'green':'amber')}>{p.status==='cancelled'?'Отменено':p.linkIssuedAt?'Принимает переходы':'Не выпущена'}</span></div>
 {p.linkIssuedAt?<><button type="button" className="code-box link-copy" onClick={()=>{void copy();}} disabled={!url} aria-label="Скопировать ссылку размещения">{url||'Настройте PUBLIC_APP_URL на сервере'}</button><p className="muted mt-2">Нажмите, чтобы скопировать</p><div className="actions mt-3"><a className="source-link" href={'/r/'+p.id+'?preview=1'} target="_blank" rel="noreferrer">Проверить переход <ExternalLink size={14}/></a></div><p className="muted mt-3">Вставьте адрес в текст поста. Переход записывается на сайте, затем открывается @tracker_marketing_bot. Проверка использует тестовый источник и не увеличивает показатели.</p><p className="muted">Ссылка сохраняется при редактировании текста и бюджета. Она уже связана с этим размещением, его кампанией, каналом и курсами.</p></>:<><p>Выпустите ссылку до публикации и вставьте её в Telegram-пост.</p><Button onClick={issue} disabled={!admin||busy||p.status==='cancelled'} className="mt-3"><Link2 size={16}/>{busy?'Выпускаю…':'Выпустить уникальную ссылку'}</Button></>}
 {p.postUrl?<div className="mt-4"><a href={p.postUrl} target="_blank" rel="noreferrer" className="source-link">Пост в Telegram <ExternalLink size={14}/></a><p className="muted mt-2">{p.publishedAt?'Опубликован: '+p.publishedAt.replace('T',' ').replace('.000Z',' UTC'):''} · {p.publicationDetection==='auto'?'Найден автоматически':p.publicationDetection==='manual_verified'?'Ручной адрес проверен':'Адрес сохранён вручную'}</p></div>:<p className="muted mt-4">{status}. Публичный пост обнаруживается по точной ссылке: от 15 минут до планового времени до 2 часов после него.</p>}
 {p.lastPublicationCheckError&&<p className="muted mt-2">{p.lastPublicationCheckError}</p>}
 {admin&&p.mode==='live'&&p.linkIssuedAt&&status==='Не найден автоматически'&&<details className="post-location mt-4"><summary>Указать пост вручную</summary><p className="muted mt-2">Если канал приватный или проверка не сработала, укажите адрес и фактическую дату. Ручной источник будет отмечен отдельно.</p><form onSubmit={attach} className="mt-3"><label className="field">Адрес Telegram-поста<Input required value={postUrl} onChange={e=>setPostUrl(e.target.value)} placeholder="https://t.me/channel/123"/></label><label className="field mt-3">Фактическая публикация UTC<Input required type="datetime-local" value={publishedAt} onChange={e=>setPublishedAt(e.target.value)}/></label><Button size="sm" variant="outline" className="mt-3" type="submit" disabled={busy}>Сохранить пост</Button></form></details>}
 </section>;
}
