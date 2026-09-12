import {requireAdmin} from '@/lib/auth';
import {workspace} from '@/lib/store';
import {exportTelegramCsv} from '@/lib/telegram-core';
export async function GET(req:Request){const denied=await requireAdmin(req);if(denied)return denied;
 const data=await workspace(),csv=exportTelegramCsv(data.botEvents??[]);
 return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="events.csv"','Cache-Control':'no-store'}});
}
