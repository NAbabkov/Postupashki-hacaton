import {sha256} from './bot-referral';
import type {Placement,Touch} from './types';
export const BOT_HEADERS=['timestamp','user_id','username','event','source_code','social_network','channel','content_id'];
export const MAX_CSV_BYTES=2*1024*1024,MAX_CSV_ROWS=5000;
export function parseCsv(text:string){
 if(new TextEncoder().encode(text).length>MAX_CSV_BYTES)throw new Error('CSV больше 2 МБ. Разделите экспорт.');
 text=text.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw new Error('Некорректные кавычки в CSV.');quoted=true;}
  else if(c===','){row.push(field);field='';closed=false;}
  else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v!==''))rows.push(row);row=[];field='';closed=false;if(rows.length>MAX_CSV_ROWS+1)throw new Error('В CSV больше 5000 строк.');}
  else{if(closed)throw new Error('Символ после закрывающей кавычки в CSV.');field+=c;}
 }
 if(quoted)throw new Error('Незакрытые кавычки в CSV.');row.push(field);if(row.some(v=>v!==''))rows.push(row);
 if(rows.length>MAX_CSV_ROWS+1)throw new Error('В CSV больше 5000 строк.');
 if(!rows.length||rows[0].join(',')!==BOT_HEADERS.join(','))throw new Error('Нужны точные 8 колонок events.csv: '+BOT_HEADERS.join(','));
 return rows.slice(1);
}
export function botTimestamp(value:string,timezone:string){
 const zoned=/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/.test(value);
 if(zoned){botTimestamp(value.replace('T',' ').slice(0,19),'UTC');const time=Date.parse(value.replace(' ','T'));if(!Number.isFinite(time))throw new Error('Неверная дата.');return new Date(time).toISOString();}
 const m=/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(value);
 if(!m)throw new Error('Дата должна быть YYYY-MM-DD HH:mm:ss или ISO-8601 с часовым поясом.');
 const zone=/^(?:UTC)?([+-])(\d\d):(\d\d)$/.exec(timezone),offset=timezone==='UTC'?0:zone?(zone[1]==='-'?-1:1)*(Number(zone[2])*60+Number(zone[3])):NaN;
 if(!Number.isFinite(offset)||Math.abs(offset)>840||zone&&Number(zone[3])>59)throw new Error('Для даты без часового пояса выберите часовой пояс экспорта.');
 const nums=m.slice(1).map(Number),utc=Date.UTC(nums[0],nums[1]-1,nums[2],nums[3],nums[4],nums[5]),d=new Date(utc);
 if(d.getUTCFullYear()!==nums[0]||d.getUTCMonth()+1!==nums[1]||d.getUTCDate()!==nums[2]||d.getUTCHours()!==nums[3]||d.getUTCMinutes()!==nums[4]||d.getUTCSeconds()!==nums[5])throw new Error('Несуществующая дата или время.');
 return new Date(utc-offset*60000).toISOString();
}
async function identity(salt:string,id:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(salt),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function normalizeBotCsv(text:string,timezone:string,salt:string,placements:Placement[]){
 if(salt.length<32)throw new Error('BOT_IMPORT_SALT не настроен на сервере.');
 const rows=parseCsv(text),events:Touch[]=[],warnings:string[]=[],errors:string[]=[],sampleRows:object[]=[],sourceKeys=new Set<string>(),seen=new Set<string>();
 const counts={start:0,payment_click:0};let skippedTests=0,duplicates=0,mapped=0,unmapped=0,organic=0;
 const warn=(message:string)=>{if(warnings.length<100)warnings.push(message);};
 const importId='import_'+crypto.randomUUID();
 for(let i=0;i<rows.length;i++){
  const r=rows[i].map(v=>v.trim());try{
   if(r.length!==8)throw new Error('Требуется 8 полей.');
   const [timestamp,userId,username,event,rawSource,network,columnChannel,contentId]=r;
   if(event!=='start'&&event!=='payment_click')throw new Error('Допустимы только start и payment_click.');
   const pieces=rawSource?rawSource.split('|').map(v=>v.trim()):null;
   if(pieces&&(pieces.length!==3||pieces.some(v=>!v)||pieces.some(v=>v.length>200)))throw new Error('source_code должен содержать ровно три непустых части.');
   const [social,channel,key]=pieces??[null,null,null];
   if(key?.startsWith('test_')||contentId.startsWith('test_')){skippedTests++;continue;}
   const at=botTimestamp(timestamp,timezone);
   let botUserKey:string,identityBasis:Touch['identityBasis'];
   if(userId){if(!/^\d{1,20}$/.test(userId))throw new Error('user_id должен быть числовым Telegram ID.');botUserKey=await identity(salt,userId);identityBasis='telegram_id_hmac';}
   else{if(!/^[a-f0-9]{64}$/i.test(username))throw new Error('Нет user_id или существующего 64-символьного username hash.');botUserKey=username.toLowerCase();identityBasis='username_hash';warn('Строка '+(i+2)+': идентичность по username hash; смена username может разделить пользователя.');}
   const source=pieces?.join('|')??null;
   if(pieces&&[network,columnChannel,contentId].some((v,n)=>v&&v!==pieces[n]))warn('Строка '+(i+2)+': отдельные source-колонки отличаются; использован source_code.');
   if(!source&&(network||columnChannel||contentId))warn('Строка '+(i+2)+': source_code пустой; отдельные поля не восстанавливают источник.');
   const candidates=placements.filter(p=>p.mode==='live'&&p.linkIssuedAt&&p.botTrackingKey===key&&p.botSourceCode===source);
   const p=candidates.length===1?candidates[0]:null;
   if(key)sourceKeys.add(key);
   if(source&&!p)warn('Строка '+(i+2)+': источник не связан с live-размещением; сохранён без атрибуции.');
   const id='bot_'+await sha256(JSON.stringify([at,botUserKey,event,source]));if(seen.has(id)){duplicates++;continue;}seen.add(id);
   counts[event]++;if(p)mapped++;else{unmapped++;if(!source)organic++;}
   events.push({id,mode:'live',userId:'bot_'+botUserKey,placementId:p?.id??null,type:event==='start'?'bot_start':'bot_payment_click',at,botUserKey,sourceCode:source,botTrackingKey:key,botImportId:importId,identityBasis,socialNetwork:social,channel});
   if(sampleRows.length<5)sampleRows.push({at,event,identity:identityBasis==='telegram_id_hmac'?'Telegram ID → HMAC':'Username hash',sourceCode:source,placement:p?.title??'Источник бота неизвестен'});
  }catch(e){if(errors.length<100)errors.push('Строка '+(i+2)+': '+(e instanceof Error?e.message:'Ошибка нормализации.'));}
 }
 const times=events.map(e=>e.at).sort();
 return {events,headers:BOT_HEADERS,rowsCount:rows.length,eventCounts:counts,timeRange:{from:times[0]??null,to:times.at(-1)??null},sourceKeys:[...sourceKeys],sampleRows,warnings,errors,skippedTests,duplicates,mapped,unmapped,organic,importId};
}
