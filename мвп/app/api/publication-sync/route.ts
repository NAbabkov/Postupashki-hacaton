import {isAdmin,runtimeVars,sameOrigin} from '@/lib/auth';
import {publicationSync} from '@/lib/publication-sync';
export async function POST(req:Request){
 const secret=runtimeVars().PUBLICATION_SYNC_SECRET,authorized=secret&&secret.length>=32&&req.headers.get('authorization')==='Bearer '+secret;
 if(!authorized&&(!sameOrigin(req)||!await isAdmin(req)))return Response.json({error:'Нужен доступ команды или ключ планировщика.'},{status:401});
 try{return Response.json(await publicationSync(),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e instanceof Error?e.message:'Ошибка проверки публикаций.'},{status:503});}
}
