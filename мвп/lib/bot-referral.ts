import type {Placement} from './types';
export const DEFAULT_BOT='tracker_marketing_bot';
export function channelSlug(channel:string){
 const slug=channel.trim().replace(/^@/,'').toLowerCase();
 if(!/^[a-z][a-z0-9_]{4,31}$/.test(slug))throw new Error('Введите Telegram username канала: латиница, цифры и _, от 5 до 32 символов.');
 return slug;
}
export function normalizeBot(bot:string){const value=bot.trim().replace(/^@/,'');if(!/^[a-z][a-z0-9_]{4,31}$/i.test(value))throw new Error('Некорректный username бота.');return value;}
export function encodeSource(source:string){return btoa(String.fromCharCode(...new TextEncoder().encode(source))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function decodeSource(param:string){if(!/^[A-Za-z0-9_-]+$/.test(param))throw new Error('Некорректный start');return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(param.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-param.length%4)%4)),c=>c.charCodeAt(0)));}
export async function sha256(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
// Deterministic per immutable placement ID: concurrent releases cannot change the key.
export async function botReferral(p:Placement,bot=DEFAULT_BOT,preview=false){
 const key=p.botTrackingKey??(await sha256('postupashki-placement:'+p.id)).slice(0,10);
 if(!/^[A-Za-z0-9_-]{8,12}$/.test(key))throw new Error('Некорректный ключ размещения.');
 const source=preview?'telegram|preview|test_'+key:(p.botSourceCode??'telegram|'+channelSlug(p.channel)+'|'+key);
 const param=preview?encodeSource(source):(p.botStartParam??encodeSource(source));
 if(param.length>64||decodeSource(param)!==source)throw new Error('Источник превышает лимит Telegram start (64 символа). Нужен более короткий username канала.');
 return {botTrackingKey:key,botSourceCode:source,botStartParam:param,url:'https://t.me/'+normalizeBot(bot)+'?start='+param};
}
export function appOrigin(value:string){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('PUBLIC_APP_URL должен быть origin сайта.');return u.origin;}
export function placementUrl(origin:string,id:string){return appOrigin(origin)+'/r/'+encodeURIComponent(id);}
