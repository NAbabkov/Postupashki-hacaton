"""External smoke test: no ChatGPT session, no outgoing Telegram calls."""
import json,re,urllib.request,urllib.error,http.cookiejar
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];URL=json.loads((ROOT/'deployment/cloudflare.json').read_text())['public_app_url']
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect());opener.addheaders=[('User-Agent','PostupiliAcceptance/3.0')];checks=[]
def call(path,method='GET',payload=None,headers=None):
 try:r=opener.open(urllib.request.Request(URL+path,data=payload,headers=headers or {},method=method),timeout=30)
 except urllib.error.HTTPError as e:r=e
 return r.status,r.read(),r.headers

def check(name,ok):checks.append({'name':name,'ok':bool(ok)});print(('PASS ' if ok else 'FAIL ')+name);assert ok,name
s,html,h=call('/');check('Homepage public HTTPS, no sign-in redirect',s==200 and b'chatgpt.com/oauth' not in html)
check('Final navigation: Calendar / Funnel / Results',all(x.encode() in html for x in ['Календарь','Воронка','Результаты']) and 'Лиды и оплаты'.encode() not in html)
(ROOT/'tmp/public-home.html').write_bytes(html)
assets=re.findall(r'(?:src|href)="(/_next/static/[^" ]+)"',html.decode())
check('Homepage assets available',bool(assets) and all(call(a)[0]==200 for a in list(dict.fromkeys(assets))[:4]))
s,raw,_=call('/api/workspace');d=json.loads(raw);check('Public read API, actual D1 and canonical origin',s==200 and d['integration']['databaseReady'] and d['integration']['publicAppUrl']==URL and not d['integration']['isAdmin'])
check('Normalized BotEvent/PurchaseIntent views, no CRM leads',bool(d.get('botEvents')) and bool(d.get('purchaseIntents')) and d['leads']==[])
check('Live Telegram identities are opaque HMAC keys',all(re.fullmatch('[a-f0-9]{64}',e['userKey']) for e in d['botEvents'] if e['mode']=='live'))
secret={k:v.strip().strip('"') for k,v in (line.split('=',1) for line in (ROOT/'.dev.vars').read_text().splitlines() if '=' in line and not line.startswith('#'))}
check('No secrets in public API/HTML/assets',all(secret[k].encode() not in raw+html+b''.join(p.read_bytes() for p in (ROOT/'dist/client').rglob('*') if p.is_file()) for k in ['ADMIN_WRITE_SECRET','BOT_IMPORT_SALT','PUBLICATION_SYNC_SECRET']))
s,_,_=call('/api/workspace','POST',b'{"action":"demo","value":{"placementId":"d001"}}',{'Content-Type':'application/json'});check('Public workspace write denied',s==401)
check('Public CSV import denied',call('/api/bot-import/preview','POST',b'')[0]==401)
check('Public confirmed Payment write denied',call('/api/payments','POST',b'{}',{'Content-Type':'application/json'})[0]==401)
check('Public refund write denied',call('/api/payments/no_payment/refund','PATCH',b'{}',{'Content-Type':'application/json'})[0]==401)
check('Public sync denied',call('/api/publication-sync','POST',b'')[0]==401)
p=next(p for p in d['placements'] if p['mode']=='demo' and p.get('linkIssuedAt') and p['status']!='cancelled')
s,_,h=call('/r/'+p['id']+'?preview=1');check('Preview redirects to configured bot without cookie',s==302 and h['Location'].startswith('https://t.me/tracker_marketing_bot?start=') and h.get('Set-Cookie') is None and h.get('Cache-Control')=='no-store')
check('Historical /r disabled',call('/r/'+next(p['id'] for p in d['placements'] if p['mode']=='historical'))[0]==404)
s,pdf,h=call('/solution.pdf');check('Solution PDF available publicly',s==200 and pdf.startswith(b'%PDF'))
jar=http.cookiejar.CookieJar();team=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));team.addheaders=[('User-Agent','PostupiliAcceptance/3.0')];r=team.open(urllib.request.Request(URL+'/api/admin',data=json.dumps({'password':secret['ADMIN_WRITE_SECRET']}).encode(),headers={'Content-Type':'application/json'},method='POST'));check('Team admin sign-in works',r.status==200 and 'HttpOnly' in r.headers.get('Set-Cookie','') and 'Secure' in r.headers.get('Set-Cookie',''))
r=team.open(URL+'/api/workspace');check('Team session authorized on public hosting',json.load(r)['integration']['isAdmin'])
s,body,_=call('/api/publication-sync','POST',b'',{'Authorization':'Bearer '+secret['PUBLICATION_SYNC_SECRET']});check('Production machine scheduler endpoint works',s==200 and 'pending' in json.loads(body))
(ROOT/'docs/public-smoke-results.json').write_text(json.dumps({'url':URL,'checks':checks,'total':len(checks),'passed':sum(c['ok'] for c in checks)},ensure_ascii=False,indent=2)+'\n')
print('External checks:',len(checks))
