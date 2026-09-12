import {workspace,save}from '@/lib/store';
import {COOKIE,visitor,visitorUser,eventTime}from '@/lib/visitors';
export async function GET(req:Request,{params}:{params:Promise<{placementId:string}>}){
 const {placementId}=await params,data=await workspace(),p=data.placements.find(p=>p.id===placementId&&p.mode!=='historical'&&p.status==='published'&&p.linkIssuedAt);
 if(!p)return new Response('Ссылка ещё не выпущена, размещение не опубликовано или относится к историческому архиву.',{status:404});
 if(!data.integration?.databaseReady)return new Response('Хранилище недоступно; источник не сохранён.',{status:503});
 const id=visitor(req)??crypto.randomUUID().replaceAll('-',''),userId=visitorUser(id,p);
 await save('event',{id:'visit_'+crypto.randomUUID(),mode:p.mode,userId,placementId:p.id,type:'visit',at:eventTime(data,p,userId)},false);
 const secure=new URL(req.url).protocol==='https:'?'; Secure':'';
 return new Response(null,{status:302,headers:{Location:'/visit/'+p.id,'Cache-Control':'no-store','Set-Cookie':COOKIE+'='+id+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000'+secure}});
}
