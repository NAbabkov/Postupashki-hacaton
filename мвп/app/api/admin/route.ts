import {adminCookie,hmac,isAdmin,runtimeVars,sameOrigin} from '@/lib/auth';
const attempts=new Map<string,{count:number;until:number}>();
export async function GET(req:Request){return Response.json({isAdmin:await isAdmin(req)},{headers:{'Cache-Control':'no-store'}});}
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 const secret=runtimeVars().ADMIN_WRITE_SECRET;if(!secret||secret.length<32)return Response.json({error:'Вход команды пока не настроен на сервере.'},{status:503});
 const ip=req.headers.get('cf-connecting-ip')??'local',previous=attempts.get(ip);if(previous&&previous.until>Date.now()&&previous.count>=5)return Response.json({error:'Слишком много попыток. Повторите через 10 минут.'},{status:429});
 if(Number(req.headers.get('content-length')??0)>1024)return new Response(null,{status:413});
 let body;try{const text=await req.text();if(text.length>1024)return new Response(null,{status:413});body=JSON.parse(text);}catch{return new Response(null,{status:400});}
 if(typeof body.password!=='string'||await hmac(secret,body.password)!==await hmac(secret,secret)){if(attempts.size>1000)attempts.clear();attempts.set(ip,{count:previous&&previous.until>Date.now()?previous.count+1:1,until:Date.now()+600000});return Response.json({error:'Неверный ключ команды.'},{status:401});}
 attempts.delete(ip);return Response.json({ok:true},{headers:{'Set-Cookie':await adminCookie(req),'Cache-Control':'no-store'}});
}
export async function DELETE(req:Request){if(!sameOrigin(req))return new Response(null,{status:403});return Response.json({ok:true},{headers:{'Set-Cookie':await adminCookie(req,true),'Cache-Control':'no-store'}});}
