import {importRequest} from '@/lib/bot-import-request';
import {batchSave} from '@/lib/store';
export async function POST(req:Request){try{
 const r=await importRequest(req);if(r.response)return r.response;const n=r.normalized!;
 // All-or-nothing validation: an operator must fix invalid rows before committing.
 if(n.errors.length)return Response.json({error:'В CSV есть ошибки. Исправьте строки и повторите предпросмотр.',errors:n.errors},{status:400});
 let imported=0,mapped=0,unmapped=0;
 for(let i=0;i<n.events.length;i+=100){const entries=n.events.slice(i,i+100),result=await batchSave(entries.map(value=>({kind:'event',value})));result.forEach((v,j)=>{if(v.meta.changes){imported++;if(entries[j].placementId)mapped++;else unmapped++;}});}
 return Response.json({imported,skippedDuplicates:n.duplicates+n.events.length-imported,skippedTests:n.skippedTests,mapped,unmapped,errors:[],warnings:n.warnings,importId:n.importId},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Ошибка импорта.'},{status:400,headers:{'Cache-Control':'no-store'}});}}
