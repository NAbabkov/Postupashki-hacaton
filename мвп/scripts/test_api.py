"""Local-only Calendar v3 + Funnel API tests. Fictional fixtures; never follow redirects to Telegram."""
import csv,io,json,uuid,urllib.request,urllib.error,http.cookiejar
from pathlib import Path
from datetime import datetime,timezone,timedelta
ROOT=Path(__file__).resolve().parents[1]
BASE='http://localhost:3000'
secret={k:v.strip().strip('"') for k,v in (line.split('=',1) for line in (ROOT/'.dev.vars').read_text().splitlines() if '=' in line and not line.startswith('#'))}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
jar=http.cookiejar.CookieJar();admin=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),NoRedirect());public=urllib.request.build_opener(NoRedirect())
checks=[];keys=set();prefix='qa_'+uuid.uuid4().hex[:12]
def call(path,method='GET',body=None,who=admin,headers=None):
 h=headers or {};payload=body
 if isinstance(body,dict):payload=json.dumps(body).encode();h={**h,'Content-Type':'application/json'}
 try:r=who.open(urllib.request.Request(BASE+path,data=payload,headers=h,method=method),timeout=40)
 except urllib.error.HTTPError as e:r=e
 raw=r.read();data=json.loads(raw) if 'application/json' in r.headers.get('Content-Type','') else raw.decode(errors='replace')
 return r.status,data,r.headers

def check(name,condition):
 checks.append({'name':name,'ok':bool(condition)});print(('PASS ' if condition else 'FAIL ')+name)
 if not condition:raise AssertionError(name)

def get():return call('/api/workspace')[1]
def action(a,v,**kwargs):return call('/api/workspace','POST',{'action':a,'value':v},**kwargs)
def multipart(rows,zone='UTC'):
 out=io.StringIO();writer=csv.writer(out);writer.writerow(['timestamp','user_id','username','event','source_code','social_network','channel','content_id']);writer.writerows(rows);boundary='qa-boundary-'+uuid.uuid4().hex
 payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="timezone"\r\n\r\n{zone}\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="events.csv"\r\nContent-Type: text/csv\r\n\r\n'+out.getvalue()+f'\r\n--{boundary}--\r\n').encode()
 return payload,{'Content-Type':'multipart/form-data; boundary='+boundary}
def upload(path,rows,zone='UTC',who=admin):
 payload,h=multipart(rows,zone);return call('/api/bot-import/'+path,'POST',payload,who,h)

try:
 s,d,_=call('/api/workspace',who=public);check('Public read and D1 ready',s==200 and d['integration']['databaseReady'] and not d['integration']['isAdmin'])
 check('Public writes protected',action('demo',{'placementId':'d001'},who=public)[0]==401)
 check('Public bot import protected',upload('preview',[],who=public)[0]==401)
 check('Public scheduler protected',call('/api/publication-sync','POST',who=public)[0]==401)
 check('Login rejects cross-origin',call('/api/admin','POST',{'password':'incorrect'},headers={'Origin':'https://evil.example'})[0]==403)
 s,_,h=call('/api/admin','POST',{'password':secret['ADMIN_WRITE_SECRET']});check('Admin session uses HttpOnly cookie',s==200 and 'HttpOnly' in h['Set-Cookie'])
 check('Admin read recognized',get()['integration']['isAdmin'])
 check('Authenticated writes reject cross-origin',action('demo',{'placementId':'d001'},headers={'Origin':'https://evil.example'})[0]==403)
 check('Authenticated workspace body limit',action('placement',{'text':'x'*200001})[0]==413)
 check('Machine publication sync uses dedicated secret',call('/api/publication-sync','POST',who=public,headers={'Authorization':'Bearer '+secret['PUBLICATION_SYNC_SECRET']})[0]==200)
 at=datetime.now(timezone.utc).replace(microsecond=0)-timedelta(days=1)
 p={'id':prefix+'_p','campaignId':prefix+'_c','mode':'live','title':'API integration fixture','channel':'@qa_channel','startsAt':at.isoformat().replace('+00:00','Z'),'courses':['ML про'],'cost':0,'text':'Fictional fixture','status':'published','postUrl':'https://t.me/qa_channel/42'}
 check('Missing campaign selection rejected',action('placement',p)[0]==400)
 p['campaignName']='Explicit new API campaign';keys.update(['placement:'+p['id'],'campaign:'+p['campaignId']]);check('Placement + campaign save atomic',action('placement',p)[0]==200)
 placed=next(q for q in get()['placements'] if q['id']==p['id']);check('Forged publication ignored; defaults generated',placed['status']=='planned' and not placed['postUrl'] and placed['endsAt']>placed['startsAt'])
 s,b,_=action('issue_link',{'id':p['id']});ref=b['placement'];check('Source and short start issued',s==200 and len(ref['botStartParam'])<=64 and ref['botSourceCode'].endswith(ref['botTrackingKey']))
 again=action('issue_link',{'id':p['id']})[1]['placement'];check('Link issue idempotent',again['botStartParam']==ref['botStartParam'] and again['linkIssuedAt']==ref['linkIssuedAt'])
 before=get();s,_,h=call('/r/'+p['id']+'?preview=1',who=public);after=get();check('Preview redirects to bot without cookie/event',s==302 and h['Location'].startswith('https://t.me/tracker_marketing_bot?start=') and h.get('Set-Cookie') is None and len(after['events'])==len(before['events']))
 s,_,h=call('/r/'+p['id'],who=public);after=get();new=[e for e in after['events'] if e['id'] not in {e['id'] for e in before['events']}];keys.update('event:'+e['id'] for e in new);check('Unpublished issued link saves web_visit before bot redirect',s==302 and h['Location'].endswith(ref['botStartParam']) and len(new)==1 and new[0]['type']=='web_visit' and 'HttpOnly' in h['Set-Cookie'])
 check('Historical redirect disabled',call('/r/'+next(q['id'] for q in after['placements'] if q['mode']=='historical'),who=public)[0]==404)
 source=ref['botSourceCode'];social,channel,key=source.split('|');ts=at.strftime('%Y-%m-%d %H:%M:%S')
 rows=[[ts,'123456789','a'*64,'start',source,social,channel,key],[ts,'123456789','a'*64,'payment_click',source,social,channel,key],[ts,'999999999','b'*64,'start','','','',''],[ts,'555555555','c'*64,'start','telegram|preview|test_1234567890','telegram','preview','test_1234567890']]
 s,b,_=upload('preview',rows,zone='');check('Timezone required for naive dates',s==200 and len(b['errors'])==3)
 s,b,_=upload('preview',rows);check('Preview exact schema, mappings and privacy',s==200 and b['mapped']==2 and b['unmapped']==1 and b['skippedTests']==1 and '123456789' not in json.dumps(b) and 'botUserKey' not in json.dumps(b))
 before=get();s,b,_=upload('commit',rows);after=get();new=[e for e in after['events'] if e['id'] not in {e['id'] for e in before['events']}];keys.update('event:'+e['id'] for e in new)
 check('Commit normalized bot events, HMAC identity only',s==200 and b['imported']==3 and len(new)==3 and all(e['userId'].startswith('bot_') for e in new) and '123456789' not in json.dumps(new))
 check('Purchase click never creates Payment or Lead',len(before['payments'])==len(after['payments']) and len(before['leads'])==len(after['leads']))
 repeat=upload('commit',rows)[1];check('Repeated CSV idempotent',repeat['imported']==0 and repeat['skippedDuplicates']==3)
 current=get();bots=[e for e in current['botEvents'] if e['placementId']==p['id']];intent=next(i for i in current['purchaseIntents'] if i['placementId']==p['id']);check('BotEvent/PurchaseIntent projection, no raw Telegram ID',len(bots)==2 and len([i for i in current['purchaseIntents'] if i['placementId']==p['id']])==1 and '123456789' not in json.dumps(bots))
 check('Old CRM actions explicitly deprecated',action('new_lead',{})[0]==410 and action('lead',{})[0]==410)
 check('Public Payment creation protected',call('/api/payments','POST',{},who=public)[0]==401)
 check('Public refund protected',call('/api/payments/unknown/refund','PATCH',{'amount':0},who=public)[0]==401)
 pay={'id':prefix+'_pay','mode':'live','purchaseIntentId':intent['id'],'userKey':intent['userKey'],'course':'ML про','amount':10000,'at':(at+timedelta(hours=1)).isoformat().replace('+00:00','Z')}
 check('Payment rejects identity mismatch',call('/api/payments','POST',{**pay,'userKey':'mismatch'})[0]==400)
 check('Payment rejects missing/foreign intent',call('/api/payments','POST',{**pay,'purchaseIntentId':'missing'})[0]==400 and call('/api/payments','POST',{**pay,'mode':'demo'})[0]==400)
 check('Payment validates course and chronology',call('/api/payments','POST',{**pay,'course':'AI агенты'})[0]==400 and call('/api/payments','POST',{**pay,'at':(at-timedelta(hours=1)).isoformat().replace('+00:00','Z')})[0]==400)
 check('Payment requires explicit unknown scenario',call('/api/payments','POST',{**pay,'purchaseIntentId':None,'userKey':None})[0]==400)
 check('Payment validates date/money',call('/api/payments','POST',{**pay,'amount':0})[0]==400 and call('/api/payments','POST',{**pay,'at':'2026-02-30T12:00:00Z'})[0]==400)
 keys.add('payment:'+pay['id']);s,b,_=call('/api/payments','POST',pay);check('Confirmed Payment stored separately with intent/userKey',s==201 and b['payment']['purchaseIntentId']==intent['id'] and b['payment']['userKey']==intent['userKey'])
 check('Payment ID duplicate denied',call('/api/payments','POST',pay)[0]==409)
 check('Intent paid derived from Payment without CRM stage',next(i for i in get()['purchaseIntents'] if i['id']==intent['id'])['status']=='paid' and not get()['leads'])
 unknown={**pay,'id':prefix+'_unknown_pay','purchaseIntentId':None,'userKey':None,'unknown':True};keys.add('payment:'+unknown['id']);s,b,_=call('/api/payments','POST',unknown);check('Unknown payment keeps null user/source association',s==201 and b['payment']['userKey'] is None and b['payment']['purchaseIntentId'] is None)
 s,b,_=call('/api/payments/'+pay['id']+'/refund','PATCH',{'amount':2500});check('Partial refund lowers net but keeps confirmed buyer',s==200 and b['payment']['refundAmount']==2500 and b['payment']['status']=='paid' and next(i for i in get()['purchaseIntents'] if i['id']==intent['id'])['status']=='paid')
 check('Refund range validation',call('/api/payments/'+pay['id']+'/refund','PATCH',{'amount':10001})[0]==400)
 s,b,_=call('/api/payments/'+pay['id']+'/refund','PATCH',{'amount':10000});check('Full refund records zero net and retains past buyer',s==200 and b['payment']['status']=='refunded' and b['payment']['amount']==b['payment']['refundAmount'] and next(i for i in get()['purchaseIntents'] if i['id']==intent['id'])['status']=='paid')
 check('Confirmed payment survives workspace reload',next(q for q in get()['payments'] if q['id']==pay['id'])['refundAmount']==10000)
 pub=call('/api/workspace',who=public)[1];check('Public view removes bot identity keys and private notes',all('botUserKey' not in e for e in pub['events'] if e['mode']=='live'))
 p2={**placed,'campaignId':p['campaignId'],'text':'Edited text','status':'published','postUrl':'https://t.me/qa_channel/99','botSourceCode':'spoof'};check('Edit preserves stable source and ignores publication spoof',action('placement',p2)[0]==200 and next(q for q in get()['placements'] if q['id']==p['id'])['botSourceCode']==source)
 check('Source channel cannot change after release',action('placement',{**p2,'channel':'@other_channel'})[0]==400)
 check('Cancelled link stops redirect',action('cancel_placement',{'id':p['id']})[0]==200 and call('/r/'+p['id'],who=public)[0]==404)
 check('Logout closes write access',call('/api/admin','DELETE')[0]==200 and action('demo',{'placementId':'d001'})[0]==401)
finally:
 # Cleanup only the exact keys created by this run. SQL is retained for reproducible local cleanup.
 sql='\n'.join("DELETE FROM workspace_records WHERE key='"+k.replace("'","''")+"';" for k in sorted(keys))
 (ROOT/'tmp').mkdir(exist_ok=True);(ROOT/'tmp/api-cleanup.sql').write_text(sql+'\n')
 (ROOT/'docs/api-validation-results.json').write_text(json.dumps({'version':'funnel-v1','total':len(checks),'passed':sum(c['ok'] for c in checks),'checks':checks},ensure_ascii=False,indent=2)+'\n')
 print('API checks:',sum(c['ok'] for c in checks),'/',len(checks))
