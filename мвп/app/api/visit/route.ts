import {requireAdmin}from '@/lib/auth';
export async function POST(req:Request){const denied=await requireAdmin(req);if(denied)return denied;return Response.json({error:'Ручная форма лида удалена. Заявка создаётся из события бота payment_click.'},{status:410});}
