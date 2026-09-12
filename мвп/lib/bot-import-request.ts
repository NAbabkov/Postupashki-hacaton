import {requireAdmin,runtimeVars} from './auth';
import {MAX_CSV_BYTES,normalizeBotCsv} from './bot-import';
import {workspace} from './store';
import {limitedBody}from './request-limit';
export async function importRequest(req:Request){
 const denied=await requireAdmin(req);if(denied)return {response:denied};
 if(Number(req.headers.get('content-length')??0)>MAX_CSV_BYTES+16384)return {response:Response.json({error:'Файл больше 2 МБ.'},{status:413})};
 const bytes=await limitedBody(req,MAX_CSV_BYTES+16384),form=await new Request(req.url,{method:'POST',headers:req.headers,body:bytes}).formData(),file=form.get('file'),zone=form.get('timezone'),timezone=typeof zone==='string'?zone:'';
 if(!(file instanceof File)||file.size>MAX_CSV_BYTES)throw new Error('Выберите CSV не больше 2 МБ.');
 const data=await workspace();if(!data.integration?.databaseReady)throw new Error('Хранилище недоступно.');
 return {normalized:await normalizeBotCsv(await file.text(),timezone,runtimeVars().BOT_IMPORT_SALT??'',data.placements)};
}
