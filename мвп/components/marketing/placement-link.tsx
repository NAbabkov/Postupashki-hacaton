'use client';
import {useEffect,useState}from 'react';
import {Copy,ExternalLink,Link2}from 'lucide-react';
import {toast}from 'sonner';
import {Button}from '@/components/ui/button';
import {Input}from '@/components/ui/input';
import type{Placement}from '@/lib/types';
export default function PlacementLink({placement:p,mutate}:{placement:Placement;mutate:(a:string,v:unknown)=>Promise<unknown>}){
 const[postUrl,setPostUrl]=useState(p.postUrl),[busy,setBusy]=useState(false);
 useEffect(()=>setPostUrl(p.postUrl),[p.id,p.postUrl]);
 const url=(typeof window==='undefined'?'':window.location.origin)+'/r/'+p.id;
 async function copy(text:string){try{await navigator.clipboard.writeText(text);toast.success('Скопировано');}catch{toast.error('Не удалось скопировать. Выделите адрес в карточке.');}}
 async function issue(){setBusy(true);try{await mutate('issue_link',{id:p.id});}catch{}finally{setBusy(false);}}
 async function attach(e:React.FormEvent){e.preventDefault();setBusy(true);try{await mutate('placement',{...p,postUrl});}catch{}finally{setBusy(false);}}
 if(p.mode==='historical')return null;
 return <section className="placement-link-box"><div className="panel-header"><div><h3>Ссылка для рекламного входа</h3><p>Вставьте её в текст маркетингового поста</p></div><span className={'pill '+(p.linkIssuedAt?(p.status==='published'?'green':'amber'):'neutral')}>{p.linkIssuedAt?(p.status==='published'?'Принимает переходы':'Ожидает публикации'):'Не выпущена'}</span></div>
 {p.linkIssuedAt?<><div className="code-box">/r/{p.id}</div><div className="actions mt-3"><Button variant="outline" size="sm" onClick={()=>copy(url)}><Copy size={14}/>Копировать ссылку</Button>{p.status==='published'&&<a className="source-link" href={'/r/'+p.id} target="_blank" rel="noreferrer">Проверить вход <ExternalLink size={14}/></a>}</div><p className="muted mt-3">По этой ссылке посетитель открывает заявку на курс. При копировании добавляется домен сайта. Источник перехода — это размещение.</p></>:<><p>Выпустите адрес и вставьте его в маркетинговый пост. Он заранее связан с кампанией, каналом и курсами этого размещения.</p><Button onClick={issue} disabled={busy||p.status==='cancelled'} className="mt-3"><Link2 size={16}/>{busy?'Выпускаю…':'Выпустить уникальную ссылку'}</Button></>}
 {p.status!=='published'&&<p className="muted mt-3">Переходы начнут сохраняться после смены статуса размещения на «Опубликовано».</p>}
 <details className="post-location mt-4" open={!!p.postUrl}><summary>Где опубликован пост {p.postUrl?'· адрес сохранён':'· необязательно'}</summary><p className="muted mt-2">После публикации можно сохранить адрес самого поста в Telegram, чтобы команда могла открыть его. На трекинг этот адрес не влияет.</p><form onSubmit={attach} className="mt-3"><label className="field">Адрес поста в Telegram<Input value={postUrl} onChange={e=>setPostUrl(e.target.value)} placeholder="https://t.me/канал/номер"/></label><div className="actions mt-3"><Button size="sm" variant="outline" type="submit" disabled={busy||postUrl===p.postUrl}>Сохранить адрес поста</Button>{p.postUrl&&<a href={p.postUrl} target="_blank" rel="noreferrer" className="source-link">Открыть пост <ExternalLink size={14}/></a>}</div></form></details></section>;
}
