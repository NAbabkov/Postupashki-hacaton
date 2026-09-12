import {workspace,save} from './store';
import {runtimeVars} from './auth';
import {pendingPublication} from './publication-status';
import {fetchPublicPosts,matchingPosts} from './telegram-public';
import type {Placement} from './types';
export async function publicationSync(){
 const data=await workspace();if(!data.integration?.databaseReady)throw new Error('Хранилище недоступно.');
 const origin=runtimeVars().PUBLIC_APP_URL;if(!origin)throw new Error('Не настроен PUBLIC_APP_URL.');
 const now=new Date().toISOString(),pending=data.placements.filter(p=>pendingPublication(p)),channels=new Set(pending.map(p=>p.channel.toLowerCase()));
 let checked=0,published=0;const errors:string[]=[];
 // Bound the execution. Each channel is fetched once, at most two pages, never its full history.
 for(const channel of [...channels].slice(0,10)){
  const group=pending.filter(p=>p.channel.toLowerCase()===channel);
  if(group.every(p=>p.lastPublicationCheckAt&&Date.now()-Date.parse(p.lastPublicationCheckAt)<25000))continue;
  try{
   let posts=await fetchPublicPosts(channel);const missing=group.some(p=>!matchingPosts(posts,p,origin).length);
   if(missing&&posts.length>=20&&posts[0].messageId>1)posts=[...await fetchPublicPosts(channel,posts[0].messageId),...posts];
   for(const p of group){
    // Re-read before saving to preserve a concurrent edit/cancellation.
    const latest=(await workspace()).placements.find(q=>q.id===p.id)!;if(latest.status==='cancelled'||latest.postUrl)continue;
    const matches=matchingPosts(posts,latest,origin),match=matches[0];
    const updated:Placement={...latest,lastPublicationCheckAt:now,lastPublicationCheckError:matches.length>1?'Ссылка использована несколько раз. Выбрана самая ранняя публикация.':''};
    if(match){Object.assign(updated,{status:'published',postUrl:match.postUrl,publishedAt:match.at,publicationDetectedAt:now,publicationDetection:'auto'});published++;}
    await save('placement',updated);checked++;
   }
  }catch{errors.push(channel+': не удалось проверить публичный Telegram.');for(const p of group){const latest=(await workspace()).placements.find(q=>q.id===p.id)!;if(!latest.postUrl&&latest.status!=='cancelled')await save('placement',{...latest,lastPublicationCheckAt:now,lastPublicationCheckError:'Публичный Telegram временно недоступен. Повторим проверку в рабочем окне.'});}}
 }
 return {checked,published,errors,pending:pending.length};
}
