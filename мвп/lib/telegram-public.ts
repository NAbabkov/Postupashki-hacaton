import {channelSlug,placementUrl} from './bot-referral';
import {inPublicationWindow} from './publication-status';
import type {Placement} from './types';
export interface PublicPost{postUrl:string;at:string;links:string[];messageId:number;}
export function htmlDecode(value:string){return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(_,e:string)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[e.toLowerCase()]??''));}
export function parsePublicPosts(html:string,channel:string):PublicPost[]{
 const slug=channelSlug(channel),markers=[...html.matchAll(/data-post=["']([^"']+)["']/g)],out:PublicPost[]=[];
 for(let i=0;i<markers.length;i++){const m=markers[i],post=htmlDecode(m[1]),block=html.slice(m.index,(markers[i+1]?.index??html.length)),time=/\bdatetime=["']([^"']+)["']/.exec(block)?.[1];
  if(!new RegExp('^'+slug+'/\\d+$','i').test(post)||!time||!Number.isFinite(Date.parse(time)))continue;
  out.push({postUrl:'https://t.me/'+post,at:new Date(time).toISOString(),messageId:Number(post.split('/')[1]),links:[...block.matchAll(/\bhref=["']([^"']*)["']/g)].map(v=>htmlDecode(v[1]))});
 }
 return out.sort((a,b)=>a.at.localeCompare(b.at)||a.messageId-b.messageId);
}
export function matchingPosts(posts:PublicPost[],p:Placement,origin:string){
 const target=new URL(placementUrl(origin,p.id));
 return posts.filter(post=>inPublicationWindow(p,Date.parse(post.at))&&post.links.some(link=>{try{const u=new URL(link,origin);return u.origin===target.origin&&u.pathname===target.pathname&&!u.search&&!u.hash;}catch{return false;}}));
}
export async function fetchPublicPosts(channel:string,before?:number){
 const slug=channelSlug(channel),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
 try{
  const response=await fetch('https://t.me/s/'+slug+(before?'?before='+before:''),{signal:controller.signal,redirect:'error',headers:{'User-Agent':'PostupashkiPublicationScanner/3.0'}});
  if(!response.ok)throw new Error('Telegram ответил '+response.status+'.');
  if(Number(response.headers.get('content-length')??0)>3*1024*1024)throw new Error('Ответ Telegram больше 3 МБ.');
  const reader=response.body?.getReader();if(!reader)throw new Error('Telegram не вернул HTML.');let size=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3*1024*1024){await reader.cancel();throw new Error('Ответ Telegram больше 3 МБ.');}chunks.push(value);}
  const joined=new Uint8Array(size);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.length;}
  const posts=parsePublicPosts(new TextDecoder().decode(joined),slug);if(!posts.length)throw new Error('Публичные посты не доступны. Возможен приватный канал или изменение HTML Telegram.');return posts;
 }finally{clearTimeout(timer);}
}
