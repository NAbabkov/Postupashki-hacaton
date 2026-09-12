import {workspace,batchSave}from '@/lib/store';
import {visitor,visitorUser,eventTime}from '@/lib/visitors';
import type{Lead}from '@/lib/types';
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Недопустимый источник'},{status:403});
 try{
  const b=await req.json() as {placementId:string;course:string},data=await workspace(),p=data.placements.find(p=>p.id===b.placementId&&p.mode!=='historical'&&p.status==='published'&&p.linkIssuedAt),id=visitor(req);
  if(!p||!id||!data.courses.includes(b.course)||(p.courses.length&&!p.courses.includes(b.course)))return Response.json({error:'Откройте уникальную ссылку размещения и выберите доступный курс.'},{status:400});
  const userId=visitorUser(id,p);
  if(!data.events.some(e=>e.mode===p.mode&&e.userId===userId&&e.placementId===p.id&&e.type==='visit'))return Response.json({error:'Сначала перейдите по уникальной ссылке размещения.'},{status:400});
  const old=data.leads.find(l=>l.mode===p.mode&&l.userId===userId&&l.course===b.course);
  if(old)return Response.json({ok:true,leadId:old.id,duplicate:true});
  const first=data.events.filter(e=>e.mode===p.mode&&e.userId===userId&&e.type==='visit').sort((a,b)=>a.at.localeCompare(b.at)).find(e=>{const q=data.placements.find(q=>q.id===e.placementId);return q&&(!q.courses.length||q.courses.includes(b.course));});
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(userId+'|'+b.course))),leadId='lead_'+Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
  const at=eventTime(data,p,userId),l:Lead={id:leadId,mode:p.mode,userId,course:b.course,sourcePlacementId:first?.placementId??p.id,stage:'new',owner:'',note:p.mode==='demo'?'Заявка из вымышленного сценария уникальной ссылки.':'Заявка с уникальной ссылки; источник связан с этим браузером.',createdAt:at};
  await batchSave([{kind:'lead',value:l},{kind:'event',value:{id:'lead_event_'+l.id,mode:p.mode,userId,placementId:p.id,type:'lead',course:b.course,at}}]);
  return Response.json({ok:true,leadId:l.id});
 }catch{return Response.json({error:'Не удалось сохранить заявку. Попробуйте ещё раз.'},{status:503});}
}
