import {readFileSync,writeFileSync,mkdirSync,existsSync}from 'node:fs';
import {resolve}from 'node:path';
import {spawnSync}from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),file=resolve(root,'deployment/cloudflare.json');
if(!existsSync(file))throw new Error('Создайте deployment/cloudflare.json по example после создания production D1.');
const settings=JSON.parse(readFileSync(file,'utf8'));
if(!/^[0-9a-f-]{36}$/i.test(settings.database_id)||settings.database_id.startsWith('00000000'))throw new Error('Нужен реальный production D1 ID.');
const origin=new URL(settings.public_app_url);if(origin.protocol!=='https:'||origin.origin!==settings.public_app_url||origin.hostname.endsWith('chatgpt.site'))throw new Error('Нужен фактический публичный HTTPS origin Cloudflare.');
mkdirSync(resolve(root,'.wrangler'),{recursive:true});
const config=resolve(root,'.wrangler/production.json');
writeFileSync(config,JSON.stringify({name:settings.name,main:resolve(root,'scripts/worker-cloudflare.js'),compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],workers_dev:true,assets:{directory:resolve(root,'dist/client')},d1_databases:[{binding:'DB',database_name:settings.database_name,database_id:settings.database_id,migrations_dir:resolve(root,'drizzle')}],vars:{PUBLIC_APP_URL:settings.public_app_url,TELEGRAM_BOT_USERNAME:'tracker_marketing_bot'},triggers:{crons:['*/5 * * * *']},observability:{enabled:true}},null,2));
const wrangler=resolve(root,'node_modules/wrangler/bin/wrangler.js');
function run(args,extra={}){const result=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,WRANGLER_WRITE_LOGS:'false',...extra},stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
if(process.argv.includes('--config-only')){console.log('Production config prepared: .wrangler/production.json');process.exit(0);}
run([resolve(root,'node_modules/vinext/dist/cli.js'),'build'],{PUBLIC_DEPLOY:'1'});
if(!process.argv.includes('--dry-run'))run([wrangler,'d1','migrations','apply','DB','--remote','--config',config]);
run([wrangler,'deploy','--config',config,...(process.argv.includes('--dry-run')?['--dry-run','--outdir',resolve(root,'tmp/public-worker')]:[])]);
