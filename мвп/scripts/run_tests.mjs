import ts from 'typescript';
import {mkdirSync,readFileSync,writeFileSync}from 'node:fs';
import {spawnSync}from 'node:child_process';
mkdirSync('tmp',{recursive:true});
const libs=['attribution','reporting','bot-referral','bot-import','telegram-public','publication-status','bot-funnel','calendar-export','request-limit','funnel-data','funnel-report','payments','telegram-core'],tests=['attribution','reporting','calendar_v3','funnel','telegram'];
for(const src of [...libs.map(n=>'lib/'+n+'.ts'),...tests.map(n=>'scripts/test_'+n+'.ts')]){
 let text=readFileSync(src,'utf8');for(const lib of libs)text=text.replaceAll("'./"+lib+"'","'./"+lib+".mjs'").replaceAll("'../lib/"+lib+"'","'./"+lib+".mjs'");
 if(src.includes('test_'))text=text.replace("import seed from '../data/seed.json';","import {readFileSync}from 'node:fs';const seed=JSON.parse(readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'));");
 const name=src.split('/').at(-1).replace('.ts','.mjs');writeFileSync('tmp/'+name,ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const result=spawnSync(process.execPath,['--test',...tests.map(n=>'tmp/test_'+n+'.mjs')],{stdio:'inherit'});process.exit(result.status??1);
