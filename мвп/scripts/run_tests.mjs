import ts from 'typescript';
import {mkdirSync,readFileSync,writeFileSync}from 'node:fs';
import {spawnSync}from 'node:child_process';
mkdirSync('tmp',{recursive:true});
for(const [src,out]of [['lib/attribution.ts','attribution.mjs'],['lib/reporting.ts','reporting.mjs'],['scripts/test_attribution.ts','test-attribution.mjs'],['scripts/test_reporting.ts','test-reporting.mjs']]){
 let text=readFileSync(src,'utf8').replaceAll("'./attribution'","'./attribution.mjs'").replaceAll("'../lib/attribution'","'./attribution.mjs'").replaceAll("'../lib/reporting'","'./reporting.mjs'");
 if(src.includes('test_'))text=text.replace("import seed from '../data/seed.json';","import {readFileSync}from 'node:fs';const seed=JSON.parse(readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'));");
 writeFileSync('tmp/'+out,ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const result=spawnSync(process.execPath,['--test','tmp/test-attribution.mjs','tmp/test-reporting.mjs'],{stdio:'inherit'});process.exit(result.status??1);
