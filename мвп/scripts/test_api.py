"""Local-only integration checks of links, forms, payment and finance persistence.
No external Telegram requests, no payment gateway, no browser automation.
"""
from pathlib import Path
import json, urllib.request, urllib.error, uuid, os
from datetime import datetime,timedelta,timezone
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('APP_URL','http://localhost:3000').rstrip('/')
assert BASE.startswith(('http://localhost:','http://127.0.0.1:')), 'Local test only'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
opener=urllib.request.build_opener(NoRedirect)
def req(path,body=None,headers=None):
 r=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})})
 try:
  with opener.open(r,timeout=60) as x:return x.status,{k.lower():v for k,v in x.headers.items()},x.read()
 except urllib.error.HTTPError as e:return e.code,{k.lower():v for k,v in e.headers.items()},e.read()
def snap():
 s,_,b=req('/api/workspace');assert s==200;return json.loads(b)
def post(action,value,status=200):
 s,_,b=req('/api/workspace',{'action':action,'value':value});assert s==status,(action,s,b.decode()[:250]);return json.loads(b)
checks=[]
def ok(name):checks.append(name)
d=snap();assert d['integration']['databaseReady'];assert len([p for p in d['payments'] if p['mode']=='historical'])==795;ok('Case data and D1 loaded')
old=next(p for p in d['placements'] if p['mode']=='historical');post('placement',{**old,'mode':'demo'},400);assert next(p for p in snap()['placements'] if p['id']==old['id'])==old;ok('Historical placement immutable')
base=next(p for p in d['placements'] if p['id']=='d001')
post('placement',{**base,'cost':-1},400);post('placement',{**base,'endsAt':'2020-01-01T00:00:00Z'},400);post('placement',{**base,'originUrl':'javascript:alert(1)'},400);ok('Invalid dates, costs and URLs rejected')
post('placement',{**base,'courses':d['courses'][:2],'courseShares':{d['courses'][0]:.8,d['courses'][1]:.8}},400);ok('Course budget shares must conserve 100 percent')
assert req('/api/workspace',{'action':'settings','value':d['settings']},{'Origin':'https://example.invalid'})[0]==403;ok('Foreign browser origin rejected')
assert req('/api/ingest',{'type':'payment'})[0]==401;ok('Trusted payment import needs authentication')
assert req('/r/'+old['id'])[0]==404;assert req('/api/visit',{'placementId':base['id'],'course':base['courses'][0]})[0]==400;ok('Historical links and direct form without visitor rejected')
status,h,_=req('/r/d001');assert status==302 and h['location']=='/visit/d001';assert 'HttpOnly' in h['set-cookie'];cookie=h['set-cookie'].split(';')[0];headers={'Cookie':cookie};ok('Unique link records first-party visitor and redirects to course form')
status,h,_=req('/r/d013',headers=headers);assert status==302 and h['set-cookie'].split(';')[0]==cookie;ok('Second campaign link preserves the same visitor')
s,_,b=req('/api/visit',{'placementId':'d013','course':base['courses'][0]},headers);assert s==200;b=json.loads(b);leadid=b['leadId']
s,_,b=req('/api/visit',{'placementId':'d013','course':base['courses'][0]},headers);assert s==200 and json.loads(b)['leadId']==leadid;fresh=snap();l=next(l for l in fresh['leads'] if l['id']==leadid);assert next(e for e in fresh['events'] if e['id']=='lead_event_'+leadid)['course']==base['courses'][0];assert l['sourcePlacementId']=='d001';assert len([x for x in fresh['leads'] if x['userId']==l['userId']])==1;ok('Form binds course and first source; repeated form is idempotent')
post('lead',{**l,'stage':'paid'},400);post('lead',{**l,'stage':'qualified','owner':'QA manager'});ok('Manager stage persists; paid status requires registered payment')
at=max(datetime.fromisoformat(e['at'].replace('Z','+00:00')) for e in fresh['events'] if e['userId']==l['userId'])+timedelta(hours=1)
payment={'id':'qa_pay_'+uuid.uuid4().hex[:12],'leadId':leadid,'mode':'demo','userId':l['userId'],'course':l['course'],'amount':10000,'at':at.isoformat(),'source':'local integration fixture','status':'paid','refundAmount':0}
post('payment',{**payment,'course':next(c for c in d['courses'] if c!=l['course'])},400);post('payment',payment);post('payment',payment,409);assert next(x for x in snap()['leads'] if x['id']==leadid)['stage']=='paid';ok('Payment matches its course opportunity and is not doubled')
post('refund',{'id':payment['id'],'amount':10001},400);post('refund',{'id':payment['id'],'amount':2500});p=next(p for p in snap()['payments'] if p['id']==payment['id']);assert p['refundAmount']==2500 and p['status']=='paid';ok('Partial refund persists without deleting original payment')
qaid='p_qa_'+uuid.uuid4().hex[:12];qa={**base,'id':qaid,'campaignId':'c_'+qaid,'mode':'live','cost':1000,'status':'planned'};post('placement',{**qa,'campaignName':'QA campaign'});assert not next(p for p in snap()['placements'] if p['id']==qaid).get('linkIssuedAt');assert req('/r/'+qaid)[0]==404
post('issue_link',{'id':old['id']},400);released=post('issue_link',{'id':qaid});again=post('issue_link',{'id':qaid});assert released['path']==again['path']=='/r/'+qaid and released['placement']['linkIssuedAt']==again['placement']['linkIssuedAt'];assert req('/r/'+qaid)[0]==404;ok('Links are released once per placement; planned and historical redirects remain inactive')
qa={**released['placement'],'status':'published','postUrl':'https://t.me/qa_test_channel/123'};post('placement',{**qa,'linkIssuedAt':'2000-01-01T00:00:00Z'});q=next(p for p in snap()['placements'] if p['id']==qaid);assert q['postUrl']==qa['postUrl'] and q['linkIssuedAt']==released['placement']['linkIssuedAt'];assert req('/r/'+qaid,headers=headers)[0]==302;post('placement',{**q,'campaignId':'changed_campaign'},400);ok('Post association and release date persist; a source with visits cannot be reassigned')
c={'id':qa['campaignId'],'mode':'live','name':'QA course campaign','goal':'QA only','owner':'','extraCost':200,'estimatedAdCost':None};post('campaign',c);assert next(c for c in snap()['campaigns'] if c['id']==qa['campaignId'])['extraCost']==200;ok('Campaign metadata and other marketing costs saved')
course=next(c for c in d['courses'] if not any(e['mode']=='live' and e['course']==c for e in d.get('economics',[])))
e={'id':'qa_eco_'+uuid.uuid4().hex[:12],'mode':'live','course':course,'deliveryPercent':30,'feePercent':2,'perSaleCost':500};post('economics',{**e,'feePercent':101},400);post('economics',e);assert next(x for x in snap()['economics'] if x['id']==e['id'])['perSaleCost']==500;ok('Course unit economics saved and validated')
report={'passed':True,'count':len(checks),'checks':checks,'environment':'local D1; fictional link visitor/form/payments only; no external bot or payment calls'}
(ROOT/'docs/api-validation-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
keys=['placement:'+qaid,'campaign:'+qa['campaignId'],'economics:'+e['id'],'payment:'+payment['id'],'lead:'+leadid]+['event:'+e['id'] for e in snap()['events'] if e['userId']==l['userId'] or e['placementId']==qaid]
(ROOT/'tmp/api-cleanup.json').write_text(json.dumps({'keys':keys}))
q=lambda s:"'"+s.replace("'","''")+"'"
(ROOT/'tmp/api-cleanup.sql').write_text('DELETE FROM workspace_records WHERE key IN ('+','.join(map(q,keys))+');\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
