import {workspace,save}from '@/lib/store';
import {COOKIE,visitor,visitorUser}from '@/lib/visitors';
import {botReferral} from '@/lib/bot-referral';
export async function GET(req:Request,{params}:{params:Promise<{placementId:string}>}){
 const {placementId}=await params,data=await workspace(),p=data.placements.find(p=>p.id===placementId&&p.mode!=='historical'&&p.status!=='cancelled'&&p.linkIssuedAt);
 if(!p)return new Response('Ссылка не выпущена, отменена или относится к архиву.',{status:404,headers:{'Cache-Control':'no-store'}});
 try{
  const preview=new URL(req.url).searchParams.get('preview')==='1',r=await botReferral(p,data.settings.botUsername,preview);
  if(preview)return new Response(null,{status:302,headers:{Location:r.url,'Cache-Control':'no-store'}});
  if(!data.integration?.databaseReady)return new Response('Хранилище недоступно; переход не записан.',{status:503,headers:{'Cache-Control':'no-store'}});
  const id=visitor(req)??crypto.randomUUID().replaceAll('-',''),userId=visitorUser(id,p);
  await save('event',{id:'web_'+crypto.randomUUID(),mode:p.mode,userId,placementId:p.id,type:'web_visit',at:new Date().toISOString()},false);
  return new Response(null,{status:302,headers:{Location:r.url,'Cache-Control':'no-store','Set-Cookie':COOKIE+'='+id+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000'+(new URL(req.url).protocol==='https:'?'; Secure':'')}});
 }catch{return new Response('Не удалось сохранить переход или построить ссылку бота.',{status:503,headers:{'Cache-Control':'no-store'}});}
}
