"""Reproducible import; original files untouched; demo has independent IDs."""
import csv,hashlib,json,random,shutil
from pathlib import Path
from datetime import datetime,timedelta,timezone
import pandas as pd
ROOT=Path(__file__).resolve().parents[1]; CASE=ROOT.parent; RAW=ROOT/'data/raw'
RAW.mkdir(parents=True,exist_ok=True)
sources={'purchases.xlsx':CASE/'передача_контекста/base.xlsx','reviewed_posts.csv':CASE/'проверка_разметки_и_видео/посты_для_календаря.csv','observed_posts.jsonl':CASE/'решение/history_collector/data/marketing_history_20260804_20260910.jsonl'}
for name,path in sources.items():
 if path.exists():shutil.copy2(path,RAW/name)
raw_posts=[json.loads(s) for s in (RAW/'observed_posts.jsonl').read_text().splitlines() if s.strip()]
raw_by={(p['channel_username'],str(p['message_id'])):p for p in raw_posts}
def iso(d):return d.isoformat().replace('+00:00','Z')
placements=[]
with (RAW/'reviewed_posts.csv').open(encoding='utf-8-sig') as f:
 for p in csv.DictReader(f):
  raw=raw_by.get((p['channel_username'],p['message_id']),{})
  origin=raw.get('forwarded_from_url') or raw.get('forwarded_from') or ''
  if not isinstance(origin,str) or not origin.startswith('https://t.me/'):origin=''
  cid='hist_'+hashlib.sha256((origin or p['post_url']).encode()).hexdigest()[:12]
  dt=datetime.fromisoformat(p['published_at'])
  title=next((s.strip() for s in p['text'].splitlines() if s.strip()),'Публикация без текста')[:100]
  placements.append(dict(id='h_'+p['channel_username']+'_'+p['message_id'],campaignId=cid,mode='historical',title=title,channel='@'+p['channel_username'],
   startsAt=iso(dt),endsAt=iso(dt+timedelta(hours=1)),courses=json.loads(p['mapped_courses']),match=p['course_match_status'],tags=[t for t in p['reviewed_tags'].split(';') if t],
   status='published',owner='Историческая выгрузка',cost=None,postUrl=p['post_url'],text=p['text'],evidence=p['evidence_text'],note=p['review_note'] or p['classification_note'],originUrl=origin,paidStatus='unknown',promoCode=''))
# Union only evidence-backed copies: forwarded original URL or equal full text.
parents=list(range(len(placements)))
def root(i):
 while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
 return i
seen_origin={};seen_text={}
for i,p in enumerate(placements):
 for key,seen in [(p['originUrl'] or p['postUrl'],seen_origin),(' '.join(p['text'].casefold().split()),seen_text)]:
  if key in seen:parents[root(i)]=root(seen[key])
  else:seen[key]=i
groups={}
for i,p in enumerate(placements):groups.setdefault(root(i),[]).append(p)
for group in groups.values():
 canonical=min(p['originUrl'] or p['postUrl'] for p in group)
 for p in group:p['campaignId']='hist_'+hashlib.sha256(canonical.encode()).hexdigest()[:12]
df=pd.read_excel(RAW/'purchases.xlsx')
payments=[dict(id='hpay_'+str(i+1).zfill(4),mode='historical',userId='hist_'+str(int(r.iloc[0])),course=str(r.iloc[2]),amount=float(r.iloc[1]),at=r.iloc[3].isoformat(),source='purchases.xlsx; row '+str(i+2)+'; timezone unspecified',status='paid') for i,r in df.iterrows()]
courses=sorted(df.iloc[:,2].unique().tolist());rng=random.Random(20260912)
# Version 3: campaign identity is independent of the product; one launch sells two courses.
products=['Аналитика про','Алгоритмы про','ML про','Backend про']
names=['Вебинар «Первый оффер»','Разбор задач собеседований','Проект в портфолио','Неделя технических интервью']
channels=['@demo_analytics','@demo_algorithms','@demo_ml','@demo_career','@demo_backend','@demo_career','@demo_algorithms','@demo_backend']
campaign_defs=[dict(id='demo_camp_'+str(i+1).zfill(3),mode='demo',name=names[i],goal='Оплаты курса '+products[i],owner='Участник '+str(i+1),extraCost=[2000,1500,2500,2000][i],estimatedAdCost=None) for i in range(4)]
for i in range(12):
 course=products[i%4] if i<8 else ['AI агенты','Backend старт','Аналитика старт','ML старт'][i-8]
 dt=datetime(2026,9,12,10,tzinfo=timezone.utc)+timedelta(days=i%4 if i<4 else 4+i%4 if i<8 else 6+i-8 if i<10 else 9+i-8)
 cid=campaign_defs[i%4]['id'] if i<8 else 'demo_career_launch' if i<10 else 'demo_plan_'+str(i)
 if i==8:campaign_defs.append(dict(id=cid,mode='demo',name='Карьерный старт · сентябрь',goal='Набор на две программы',owner='Участник 5',extraCost=1800,estimatedAdCost=None))
 if i>=10:campaign_defs.append(dict(id=cid,mode='demo',name='Следующий набор: '+course,goal='Проверка нового размещения',owner='',extraCost=0,estimatedAdCost=None))
 placements.append(dict(id='d'+str(i+1).zfill(3),campaignId=cid,mode='demo',title=('Первое размещение: ' if i<4 else 'Повторный вход: ' if i<8 else 'Размещение запуска: ' if i<10 else 'План: ')+course,channel=channels[i] if i<8 else '@demo_career',startsAt=iso(dt),endsAt=iso(dt+timedelta(hours=12)),courses=[course],match='explicit',tags=['native'],status='published' if i<10 else 'planned',owner='Участник '+str(i%5+1),cost=[12000,9000,15000,18000,6000,5000,7000,8000,16000,10000,11000,9000][i],postUrl='',text='Синтетический пример продвижения '+course+'. Канал, бюджет, касания и результаты вымышлены.',evidence='Синтетический сценарий v3, seed 20260912',note='Два канала внутри кампании одного курса; исходы сгенерированы независимо от названия ML.',originUrl='',paidStatus='synthetic',promoCode='DEMO'+str(i+1),courseShares={course:1}))
events=[];leads=[];demo_places=[p for p in placements if p['mode']=='demo' and p['status']=='published']
for i in range(60):
 uid='demo_v2_u'+str(i+1).zfill(3);p=demo_places[i%4];first=datetime.fromisoformat(p['startsAt'].replace('Z','+00:00'))+timedelta(minutes=15+rng.randrange(600));dt=first
 def event(kind,at,place):events.append(dict(id='dv2_e'+str(len(events)+1),mode='demo',userId=uid,placementId=place['id'],type=kind,at=iso(at)))
 event('visit',first,p)
 if i%5==0:continue
 event('lead',first+timedelta(minutes=2),p);stage='new'
 if i%3!=0:stage='qualified'
 # Half the leads have a second same-course placement in another channel.
 if i%2==0:
  q=demo_places[i%4+4];dt=datetime.fromisoformat(q['startsAt'].replace('Z','+00:00'))+timedelta(minutes=30+rng.randrange(180));event('visit',dt,q);
 # Conversion varies across all four cohorts, without a forced ML last touch.
 if rng.random() < [0.4,0.32,0.45,0.27][i%4]:
  stage='paid';delay=1+rng.randrange(4) if i%7 else 9
  pay=dict(id='dv2_pay_'+str(i),mode='demo',userId=uid,course=products[i%4],amount=float([12990,8950,14795,15990][i%4]),at=iso(dt+timedelta(days=delay)),source='synthetic v2 seed 20260912',status='paid',leadId='dv2_l'+str(i),refundAmount=0)
  if i%11==0:pay['refundAmount']=pay['amount']*.25
  payments.append(pay)
 leads.append(dict(id='dv2_l'+str(i),mode='demo',userId=uid,stage=stage,owner='Участник '+str(i%5+1),course=products[i%4],sourcePlacementId=p['id'],note='Вымышленная заявка на конкретный курс; первый источник сохранён отдельно от источника оплаты.',createdAt=iso(first+timedelta(minutes=2))))
# A two-campaign, same-course path makes the four attribution models visibly differ.
placements.append(dict(**{**demo_places[0],'id':'d013','campaignId':'demo_test_analytics','title':'Альтернативный тест аналитики','channel':'@demo_career','cost':4500,'startsAt':'2026-09-14T09:00:00Z','endsAt':'2026-09-14T18:00:00Z'}))
campaign_defs.append(dict(id='demo_test_analytics',mode='demo',name='Тест новой аудитории',goal='Сравнение рекламных входов',owner='Участник 5',extraCost=500,estimatedAdCost=None))
for i in [4,8,12,16]:
 l=next((l for l in leads if l['id']=='dv2_l'+str(i)),None)
 if not l:continue
 events.append(dict(id='dv2_alt_'+str(i),mode='demo',userId=l['userId'],placementId='d013',type='visit',at='2026-09-16T12:00:00Z'))
 pay=next((p for p in payments if p.get('leadId')==l['id']),None)
 if pay:pay['at']='2026-09-17T12:00:00Z'
 elif i==4:
  payments.append(dict(id='dv2_pay_alt4',mode='demo',userId=l['userId'],course=l['course'],amount=12990.0,at='2026-09-17T12:00:00Z',source='synthetic comparison fixture',status='paid',leadId=l['id'],refundAmount=0));l['stage']='paid'
# A single named campaign has two product rows and a distinct campaign total.
for j in range(6):
 p=next(p for p in placements if p['id']==('d009' if j<3 else 'd010'))
 uid='demo_v3_launch_'+str(j);course=p['courses'][0]
 at=datetime.fromisoformat(p['startsAt'].replace('Z','+00:00'))+timedelta(hours=1,minutes=j*10)
 events.append(dict(id='dv3_visit_'+str(j),mode='demo',userId=uid,placementId=p['id'],type='visit',at=iso(at)))
 if j%3==2:continue
 lid='dv3_lead_'+str(j);converted=j%3==0
 events.append(dict(id='dv3_form_'+str(j),mode='demo',userId=uid,placementId=p['id'],type='lead',course=course,at=iso(at+timedelta(minutes=2))))
 leads.append(dict(id=lid,mode='demo',userId=uid,course=course,sourcePlacementId=p['id'],stage='paid' if converted else 'qualified',owner='Участник 5',note='Демо одной кампании с двумя разными курсами.',createdAt=iso(at+timedelta(minutes=2))))
 if converted:payments.append(dict(id='dv3_payment_'+str(j),mode='demo',userId=uid,leadId=lid,course=course,amount=12990.0 if j<3 else 8950.0,at=iso(at+timedelta(days=2)),source='synthetic v3 product launch',status='paid',refundAmount=0))
payments.append(dict(id='dv2_unknown',mode='demo',userId='demo_v2_unknown',course='AI агенты',amount=8950.0,at='2026-09-17T11:00:00Z',source='synthetic: no recorded touch',status='paid',refundAmount=0))
economics=[dict(id='eco_demo_'+str(i),mode='demo',course=c,deliveryPercent=[30,35,28,32][i%4],feePercent=2,perSaleCost=[500,400,700,600][i%4]) for i,c in enumerate(courses)]
for p in placements:
 if p['mode']=='demo':p['linkIssuedAt']='2026-09-12T08:00:00Z'
dataset=dict(placements=placements,events=events,payments=payments,leads=leads,courses=courses,campaigns=campaign_defs,economics=economics,settings=dict(botUsername='',managerUsername='',mainChannel='postypashki_old'))
(ROOT/'data/seed.json').write_text(json.dumps(dataset,ensure_ascii=False,indent=2))
manifest=dict(version=1,historical_rows=len(df),historical_unique_users=int(df.iloc[:,0].nunique()),observed_posts=len(raw_posts),calendar_posts=62,period=['2026-08-04','2026-09-10'],synthetic_seed=20260912,synthetic_version=3,synthetic_potential_users=66,synthetic_separate_user_namespace=True,purchase_timezone='unknown',amounts='case-provided; partly approximate; not audited revenue',paid_placements='not established',source_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in RAW.iterdir() if p.is_file()},shared_research='https://chatgpt.com/share/6aa525ac-cd04-83ed-9045-28601703f4e4',source_sheets='https://docs.google.com/spreadsheets/d/1tXYSKmijPZF4saVzjcz0m-So8bzkqplK/edit',source_colab='https://colab.research.google.com/drive/1hNiEONvYHZc6I8RsTpyMKk5FHSdOrnfV')
(ROOT/'data/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
for kind,rows in [('placements',placements),('events',events),('payments',payments),('leads',leads)]:
 with (ROOT/'data'/(kind+'.csv')).open('w') as f:
  w=csv.DictWriter(f,fieldnames=list(dict.fromkeys(k for r in rows for k in r)));w.writeheader()
  for row in rows:w.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v for k,v in row.items()})
print(json.dumps({'historical_payments':len(df),'historical_posts':62,'demo_placements':sum(p['mode']=='demo' for p in placements),'demo_events':len(events),'demo_payments':sum(p['mode']=='demo' for p in payments)}))
