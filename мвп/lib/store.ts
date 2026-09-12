import {env} from 'cloudflare:workers';
import seed from '@/data/seed.json';
import type {Workspace,Placement,Touch,Payment,Lead,Settings,Campaign,CourseEconomics} from './types';
type Kind='placement'|'event'|'payment'|'lead'|'settings'|'campaign'|'economics';
export function binding(){if(!env.DB)throw new Error('Хранилище не подключено. Изменения не сохранены.');return env.DB;}
export async function workspace():Promise<Workspace>{
 const base=structuredClone(seed) as unknown as Workspace;
 base.campaigns??=[];base.economics??=[];
 let ready=true;
 try{
  const result=await binding().prepare('SELECT kind,payload FROM workspace_records ORDER BY updated_at ASC LIMIT 10000').all<{kind:Kind;payload:string}>();
  const keys={placement:'placements',event:'events',payment:'payments',lead:'leads',campaign:'campaigns',economics:'economics'} as const;
  for(const r of result.results){
   const value=JSON.parse(r.payload);
   if(r.kind==='settings'){base.settings=value as Settings;continue;}
   const arr=base[keys[r.kind]] as {id:string}[],i=arr.findIndex(v=>v.id===value.id);
   if(i<0)arr.push(value);else arr[i]=value;
  }
 }catch{ready=false;}
 const vars=env as unknown as Record<string,string|undefined>;
 base.integration={databaseReady:ready,linksReady:ready,paymentsReady:!!vars.INGEST_KEY};
 return base;
}
export async function save(kind:Kind,value:Placement|Touch|Payment|Lead|Settings|Campaign|CourseEconomics,replace=true){
 const v=value as {id?:string;mode?:string;userId?:string};
 const key=kind+':'+(v.id??'main'),payload=JSON.stringify(value);
 const sql=replace?'INSERT INTO workspace_records (key,kind,mode,user_id,payload,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at':'INSERT OR IGNORE INTO workspace_records (key,kind,mode,user_id,payload,updated_at) VALUES (?,?,?,?,?,?)';
 return binding().prepare(sql).bind(key,kind,v.mode??'config',v.userId??null,payload,new Date().toISOString()).run();
}
export async function batchSave(values:{kind:Kind;value:Placement|Touch|Payment|Lead|Campaign|CourseEconomics}[],replace=false){
 const db=binding();
 const sql=replace?'INSERT INTO workspace_records (key,kind,mode,user_id,payload,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at':'INSERT OR IGNORE INTO workspace_records (key,kind,mode,user_id,payload,updated_at) VALUES (?,?,?,?,?,?)';
 return db.batch(values.map(({kind,value})=>db.prepare(sql).bind(kind+':'+value.id,kind,value.mode,'userId' in value?value.userId:null,JSON.stringify(value),new Date().toISOString())));
}
