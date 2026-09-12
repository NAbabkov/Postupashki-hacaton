import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../data/seed.json';
import {attribute,millis,csv} from '../lib/attribution';
import {report,groupReport,defaults,netPayment}from '../lib/reporting';
import type{Workspace,Options,Placement}from '../lib/types';
const opts:Options={model:'decay',windowDays:5,halfLifeDays:2,family:false,paymentOffset:0};
const source=seed as unknown as Workspace;
function fixture(mode:'historical'|'demo'='historical'):Workspace{
 return{placements:[],events:[],payments:[{id:'pay',mode,userId:'u',course:'ML про',amount:1000,at:'2026-09-10T12:00:00Z',source:'test',status:'paid'}],leads:[],courses:['ML про'],settings:{botUsername:'',managerUsername:'',mainChannel:''}};
}
function place(id:string,at='2026-09-09T12:00:00Z',mode:'historical'|'demo'='historical'):Placement{return {...source.placements[0],id,campaignId:id,startsAt:at,mode,courses:['ML про'],match:'explicit',status:'published',cost:null};}
void test('No publication after purchase; no guessed organic source',()=>{const d=fixture();d.placements=[place('future','2026-09-11T00:00:00Z')];const r=attribute(d,'historical',opts);assert.equal(r[0].basis,'unknown');assert.equal(r[0].revenue,1000);});
void test('Strict course matching and opt-in family coefficient',()=>{const d=fixture();const p=place('family');p.match='family_candidate';d.placements=[p];assert.equal(attribute(d,'historical',opts)[0].basis,'unknown');d.placements.push(place('exact'));const r=attribute(d,'historical',{...opts,family:true});assert.ok(Math.abs(r.find(a=>a.campaignId==='exact')!.weight-2/3)<1e-9);});
void test('Distinct placements in one campaign retain separate allocation credit',()=>{const d=fixture();const a=place('a'),duplicate={...a,id:'repost'},b=place('b');d.placements=[a,duplicate,b];const r=attribute(d,'historical',{...opts,model:'linear'});assert.equal(r.length,3);assert.equal(r.filter(v=>v.campaignId==='a').reduce((s,v)=>s+v.weight,0),2/3);});
void test('Only same-user bot starts are eligible; browser requests ignored',()=>{const d=fixture('demo');d.placements=[place('a',undefined,'demo'),place('b',undefined,'demo')];d.events=[{id:'e1',mode:'demo',userId:'u',placementId:'a',type:'bot_start',at:'2026-09-09T15:00:00Z'},{id:'e2',mode:'demo',userId:'other',placementId:'b',type:'bot_start',at:'2026-09-10T11:00:00Z'},{id:'e3',mode:'demo',userId:'u',placementId:'b',type:'click',at:'2026-09-10T11:00:00Z'}];assert.equal(attribute(d,'demo',{...opts,model:'last'})[0].campaignId,'a');});
void test('First and last touch choose different eligible campaigns',()=>{const d=fixture('demo');d.placements=[place('a',undefined,'demo'),place('b',undefined,'demo')];d.events=['a','b'].map((placementId,i)=>({id:String(i),mode:'demo',userId:'u',placementId,type:'bot_start',at:i?'2026-09-10T11:00:00Z':'2026-09-09T12:00:00Z'}));assert.equal(attribute(d,'demo',{...opts,model:'first'})[0].campaignId,'a');assert.equal(attribute(d,'demo',{...opts,model:'last'})[0].campaignId,'b');});
void test('Ad ROAS and full-marketing ROMI use explicit course economics',()=>{const d=fixture('demo');d.placements=[place('a',undefined,'demo')];d.events=[{id:'e',mode:'demo',userId:'u',placementId:'a',type:'bot_start',at:'2026-09-09T12:00:00Z'}];d.campaigns=[{id:'a',mode:'demo',name:'A',goal:'test',owner:'',extraCost:0,estimatedAdCost:null}];d.economics=[{id:'eco',mode:'demo',course:'ML про',deliveryPercent:40,feePercent:0,perSaleCost:0}];const s={...defaults('demo'),from:'2026-09-01',to:'2026-09-10',asOf:'2026-09-30'};let g=groupReport(report(d,s,opts,0),'campaign')[0];assert.equal(g.roas,null);d.placements[0].cost=0;g=groupReport(report(d,s,opts,0),'campaign')[0];assert.equal(g.romi,null);d.placements[0].cost=100;g=groupReport(report(d,s,opts,0),'campaign')[0];assert.equal(g.roas,10);assert.equal(g.romi,500);});
void test('Naive purchase clock is adjustable without changing zoned post time',()=>{assert.equal(millis('2026-09-10T12:00:00',3),millis('2026-09-10T09:00:00Z'));assert.equal(millis('2026-09-10T12:00:00Z',3),millis('2026-09-10T12:00:00Z'));});
void test('Refunded rows are not treated as paid conversions',()=>{const d=fixture();d.payments[0].status='refunded';const r=attribute(d,'historical',opts);assert.equal(r.length,1);assert.equal(r[0].revenue,0);assert.equal(r[0].refunds,1000);});
void test('CSV quotes text and neutralises spreadsheet formula cells',()=>{assert.ok(csv([{a:'=1+1',b:'x,y"z'}]).includes("'=1+1"));assert.ok(csv([{a:'x,y"z'}]).includes('""'));});
void test('All source purchases conserve amount and weight for every model/window/clock',()=>{
 for(const mode of ['historical','demo'] as const)for(const model of ['last','first','linear','decay'] as const)for(const windowDays of [3,5,7,30])for(const paymentOffset of [0,3]){
  const rows=attribute(source,mode,{...opts,model,windowDays,paymentOffset,family:true}),payments=source.payments.filter(p=>p.mode===mode);
  const total=payments.reduce((s,p)=>s+netPayment(p),0);assert.ok(Math.abs(rows.reduce((s,r)=>s+r.revenue,0)-total)<1e-6);
  for(const p of payments){const rs=rows.filter(a=>a.paymentId===p.id);assert.ok(Math.abs(rs.reduce((s,a)=>s+a.weight,0)-1)<1e-9);assert.ok(rs.every(a=>a.userId===p.userId&&Number.isFinite(a.weight)&&a.weight>0));}
 }
});
const validation={historical: [0,3].map(paymentOffset=>({clock:paymentOffset,windows:[3,5,7].map(windowDays=>{const rows=attribute(source,'historical',{...opts,windowDays,paymentOffset});return{windowDays,matched:new Set(rows.filter(r=>r.basis!=='unknown').map(r=>r.paymentId)).size,unknownAmount:rows.filter(r=>r.basis==='unknown').reduce((s,r)=>s+r.revenue,0)};})})),demoModels:['first','last','linear','decay'].map(model=>({model,results:groupReport(report(source,defaults('demo'),{...opts,model:model as Options['model']},7),'campaignCourse').map(g=>({campaign:g.name,course:g.detail,netRevenue:g.netRevenue,ads:g.adCost,marketing:g.marketingCost,contribution:g.contribution,leads:g.leads,paidLeads:g.cohortBuyers,ROAS:g.roas,ROMI:g.romi}))}))};
import {writeFileSync,mkdirSync}from 'node:fs';
mkdirSync('docs',{recursive:true});writeFileSync('docs/validation-results.json',JSON.stringify(validation,null,2));
