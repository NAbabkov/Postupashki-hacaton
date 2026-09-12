import {env} from 'cloudflare:workers';
export function runtimeVars(){return env as unknown as Record<string,string|undefined>;}
const COOKIE='postupashki_admin';
const encoder=new TextEncoder();
async function key(secret:string){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function hex(b:ArrayBuffer){return Array.from(new Uint8Array(b)).map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function hmac(secret:string,value:string){return hex(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(value)));}
export async function isAdmin(req:Request){
 const secret=runtimeVars().ADMIN_WRITE_SECRET;if(!secret||secret.length<32)return false;
 const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??'';
 const [expiry,nonce,signature]=token.split('.');
 if(!/^\d{10}$/.test(expiry??'')||!/^\w{32}$/.test(nonce??'')||!/^[a-f0-9]{64}$/.test(signature??'')||Number(expiry)<=Date.now()/1000)return false;
 return crypto.subtle.verify('HMAC',await key(secret),Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16)),encoder.encode(expiry+'.'+nonce));
}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');return !origin||origin===new URL(req.url).origin;}
export async function requireAdmin(req:Request){if(!sameOrigin(req))return Response.json({error:'Недопустимый источник запроса.'},{status:403});if(!await isAdmin(req))return Response.json({error:'Для изменения данных войдите как участник команды.'},{status:401});return null;}
export async function adminCookie(req:Request,logout=false){const secret=runtimeVars().ADMIN_WRITE_SECRET!;const payload=Math.floor(Date.now()/1000+43200)+'.'+crypto.randomUUID().replaceAll('-','');return COOKIE+'='+(logout?'':payload+'.'+await hmac(secret,payload))+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(logout?'0':'43200')+(new URL(req.url).protocol==='https:'?'; Secure':'');}
