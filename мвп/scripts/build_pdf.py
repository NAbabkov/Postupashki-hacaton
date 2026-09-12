"""Two-page solution, Cyrillic fonts, reproducible and independent of paid services."""
from pathlib import Path
import shutil
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether,Flowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf/solution.pdf';OUT.parent.mkdir(parents=True,exist_ok=True)
fonts=[('/System/Library/Fonts/Supplemental/Arial.ttf','/System/Library/Fonts/Supplemental/Arial Bold.ttf'),('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')]
reg,bold=next((a,b)for a,b in fonts if Path(a).exists()and Path(b).exists())
pdfmetrics.registerFont(TTFont('Body',reg));pdfmetrics.registerFont(TTFont('Bold',bold));pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Body',boldItalic='Bold')
NAVY=colors.HexColor('#1b2842');BLUE=colors.HexColor('#4166e6');MUTED=colors.HexColor('#63738b');BORDER=colors.HexColor('#dce4f0')
styles={
 'title':ParagraphStyle('title',fontName='Bold',fontSize=20,leading=24,textColor=NAVY,spaceAfter=10),
 'h':ParagraphStyle('h',fontName='Bold',fontSize=11.5,leading=14,textColor=NAVY,spaceBefore=7,spaceAfter=5),
 'body':ParagraphStyle('body',fontName='Body',fontSize=9.6,leading=12.4,textColor=NAVY,spaceAfter=6),
 'small':ParagraphStyle('small',fontName='Body',fontSize=8.8,leading=12,textColor=MUTED,spaceAfter=6),
 'stat':ParagraphStyle('stat',fontName='Bold',fontSize=18,leading=22,textColor=BLUE),
 'label':ParagraphStyle('label',fontName='Body',fontSize=8.8,leading=12,textColor=MUTED),
}
def p(text,kind='body'):
 text=text.replace('—','-').replace('–','-').replace('\u2011','-').replace('₽','руб.')
 return Paragraph(text,styles[kind])
def h(text):return p(text,'h')
def box(text):
 t=Table([[p(text)]],colWidths=[515]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#edf2ff')),('BOX',(0,0),(-1,-1),.4,BORDER),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),5)]));return t
class BusinessFlow(Flowable):
 def __init__(self,screens=False):
  Flowable.__init__(self);self.width=515;self.height=70 if screens else 82;self.screens=screens
 def draw(self):
  c=self.canv
  if self.screens:
   blocks=[('Календарь\nПлан · ссылка · факт','#4166e6'),('Воронка\nStart · intent · Payment','#7154c5'),('Результаты\nМодели · ROAS · ROMI','#1b2842')];w=159;gap=19;size=10
  else:
   blocks=[('Размещение\nПост и бюджет','#4166e6'),('/r/ID\nСсылка поста','#4166e6'),('Telegram\nБот команды','#7154c5'),('Start\nЗапуск','#7154c5'),('Intent\nК менеджеру','#aa7200'),('Payment\nПодтверждён','#187b57'),('Результаты\nАтрибуция','#1b2842')];w=62;gap=13.5;size=8
  y=25
  for i,(label,color) in enumerate(blocks):
   x=i*(w+gap);c.setFillColor(colors.HexColor(color));c.roundRect(x,y,w,42,4,fill=1,stroke=0)
   c.setFillColor(colors.white);c.setFont('Bold',size)
   for j,line in enumerate(label.split('\n')):c.drawCentredString(x+w/2,y+27-j*12,line)
   if i<len(blocks)-1:
    c.setStrokeColor(MUTED);c.setLineWidth(1)
    if not self.screens and i==4:c.setDash(2,2)
    c.line(x+w,y+21,x+w+gap-3,y+21);c.line(x+w+gap-6,y+24,x+w+gap-3,y+21);c.line(x+w+gap-6,y+18,x+w+gap-3,y+21);c.setDash()
  if not self.screens:
   c.setFillColor(colors.HexColor('#b43643'));c.setFont('Bold',8);c.drawCentredString(4*(w+gap)+w+gap/2,10,'НЕ ОПЛАТА')
def frame(canvas,doc):
 w,he=A4;canvas.setFillColor(NAVY);canvas.rect(0,he-62,w,62,fill=1,stroke=0)
 canvas.setFont('Bold',14);canvas.setFillColor(colors.white);canvas.drawString(40,he-31,'Поступашки / измеримый маркетинг')
 canvas.setFont('Body',9);canvas.setFillColor(colors.HexColor('#bccbf1'));canvas.drawRightString(w-40,he-31,'РЕШЕНИЕ КЕЙСА · MVP')
 canvas.setStrokeColor(BORDER);canvas.line(40,36,w-40,36);canvas.setFillColor(MUTED);canvas.setFont('Body',8)
 canvas.drawString(40,23,'История, оценочная атрибуция и отдельное синтетическое демо')
 canvas.drawRightString(w-40,23,str(doc.page)+' / 2')
story=[
 p('От размещения до подтверждённой продажи','title'),
 p('<b>Задача.</b> Планировать маркетинг, сохранять источник каждого поста и сравнивать экономику подтверждённых оплат. Команда <b>«Наступашки»</b>. Три экрана: <b>Календарь / Воронка / Результаты</b>. CRM и ручные стадии убраны.'),
 h('Материалы кейса и границы данных'),
 box('<b>795 строк оплат · 606 анонимных ID · 18 курсов.</b><br/>Telegram: 182 наблюдаемых поста пяти каналов, 62 проверенных в календаре. Colab: сохранены 23 исходные EDA-ячейки.'),
 Spacer(1,8),
 p('XLSX: курс, сумма и время за 04.08-10.09.2026. Часть сумм приближена, часовой пояс неизвестен, строка курса не обязательно заказ. Нет исторических лидов, рекламных расходов и источников покупателей. Telegram - наблюдаемый снимок, полнота архива не доказана.'),
 p('Синтетическое демо: 13 размещений, 94 web-события, 150 bot-событий (96 start / 54 payment_click), 66 bot-пользователей и 18 оплат. Повторные, organic и unmapped события проверяют дедупликацию. Исходные исторические суммы и даты сохранены; вымышленные и live данные разделены.'),
 h('Календарь и стабильные ссылки'),
 BusinessFlow(),
 Spacer(1,8),
 p('Команда выбирает кампанию, канал, курсы, дату UTC, бюджет и текст. У размещения свой стабильный botTrackingKey. После выпуска нельзя менять кампанию, канал или набор курсов; повторный выпуск сохраняет адрес. Номер будущего поста для ключа не нужен.'),
 p('Источник telegram|ASCII_channel|short_key кодируется UTF-8 base64url, start не длиннее 64 символов. Сайт сохраняет web_visit перед 302 в <b>@tracker_marketing_bot</b>. Ссылка действует до обнаружения публикации. Preview передаёт test_* и не пишет web-событие; исторические и отменённые ссылки отклоняются.'),
 p('Автопоиск публичного поста проверяет точную ссылку в окне -15 минут / +2 часа к плану. Сохраняет план и факт отдельно. Проверки: интерфейс каждые 30 секунд, Cron каждые 5 минут. Ручной адрес второстепенный и имеет отдельное основание. Cron ищет публикации, <b>не загружает CSV бота</b>.'),
 h('Три связанных экрана'),
 BusinessFlow(screens=True),
 h('Публичный доступ и хранение'),
 p('Cloudflare Workers / D1: просмотр без ChatGPT, изменения по session команды. Бот работает в Cloudflare webhook: ноутбук можно выключить. Управление через кнопку <b>«Бот»</b> после входа в команду. CSV остаётся резервным импортом. Webhook доставляет события прямо в D1. Добавлены служебные таблицы bot_runtime и telegram_updates; предметная модель сохранена.'),
 p('<link href="https://demo-komandy-postupili.postupili-demo.workers.dev" color="#4166e6"><b>demo-komandy-postupili.postupili-demo.workers.dev</b></link><br/>Домены, платные планы, сервисы и списания не покупались.','small'),
 PageBreak(),
 p('Воронка, атрибуция и экономика','title'),
 h('События бота и подтверждение оплаты'),
 p('events.csv: timestamp,user_id,username,event,source_code,social_network,channel,content_id. Резервный импорт: preview → commit, до 2 МБ / 5000 строк; для даты без timezone нужен явный offset. Telegram ID преобразуется HMAC-SHA256 с серверным salt; raw ID, username и CSV не сохраняются. Полный source_code сопоставляется с размещением; неизвестный источник не заимствуется из прошлых событий.'),
 p('<b>start</b> - наблюдаемый запуск. <b>payment_click</b> - намерение купить / передача менеджеру, не оплата. Первый click по (mode,userKey,placementId,sourceCode) создаёт устойчивую PurchaseIntent. Raw события и уникальные люди показаны отдельно; общий итог объединяет людей между размещениями. Browser ID и Telegram userKey индивидуально не склеиваются.'),
 p('Менеджер создаёт <b>Payment</b> по существующей заявке: уникальный ID, курс, сумма, UTC-дата. Один курс подставляется; несколько требуют подтверждённого выбора. Вне бота - явный Unknown и null userKey. Refund уменьшает Net, но сохраняет факт прежней покупки; не меняет starts / intents. Нет оплат - нет финансовых конверсий.'),
 h('Все четыре модели сохранены'),
 p('Live/demo кандидаты: <b>bot start того же userKey</b>, точное размещение, совместимый курс, до оплаты и внутри окна. Web visit и payment_click не атрибуционные касания. Дедупликация по <b>placementId</b>: earliest для First, latest для остальных. Два поста одной кампании остаются двумя размещениями.'),
 p('<b>First Touch</b> - 100% первому; <b>Last Touch</b> - 100% последнему; <b>Linear</b> - поровну уникальным размещениям; <b>Time Decay</b> - вес 2^(-дни/полураспад), затем нормировка. Сначала Allocation, после него агрегация и фильтры по кампании / каналу / курсу. Скрытые доли не перенормируются; без подходящего касания деньги остаются Unknown. Это правило распределения, не причинный эффект.'),
 box('<b>История - только сценарная оценка.</b> Неизвестно, видел ли покупатель конкретный пост. Модели распределяют оплату между совместимыми публикациями, НЕ устанавливают фактический источник. Family-гипотезы опциональны: relevance 0,5 в Linear/Decay; First/Last могут дать 100% с low confidence. Покрытие и задержка описывают гипотезы.'),
 h('Расчёт денег'),
 p('<b>Net = сумма - возврат.</b> Доход до маркетинга C = Net × (1 - обучение% - комиссия%) - стоимость обслуживания оплаты. Реклама A суммируется по размещениям; прочий маркетинг O - один раз на кампанию; M = A + O. Многокурсовый бюджет делится по долям, иначе поровну с явным допущением.'),
 p('<b>ROAS = Net / A.</b> <b>ROMI = (C - M) / M × 100%.</b> CPL = M / уникальные заявки; CPA = M / доли подтверждённых платежей, включая возвраты, не CAC. CR start → intent и intent → оплаченный пользователь когорты считаются из уникальных ключей. Неизвестные расходы, нулевой знаменатель и незрелая когорта дают прочерк.'),
 p('Пример: Net 10 000, обучение 30%, комиссия 2%, обслуживание 500 → C = 6 300. A = 5 000, O = 1 000 → <b>ROAS 2×, ROMI 5%</b>. При полном возврате обслуживание остаётся. Постоянные расходы и налоги не распределяются.','small'),
 p('<b>Проверки:</b> 67 тестов движка/контракта/воронки/webhook/публикаций/экспорта, 45 локальных API-проверок; typecheck, application lint, production build, внешний smoke. Offline: 8 проверок бота без Telegram-запросов. Реальный Start после настройки токена проверяет команда. События webhook поступают автоматически; CSV сохраняет совместимость.','small'),
 p('<link href="https://github.com/NAbabkov/Postupashki-hacaton" color="#4166e6">Репозиторий команды</link> · <link href="https://core.telegram.org/bots/features#deep-linking" color="#4166e6">Telegram contract</link> · <link href="https://developers.cloudflare.com/workers/" color="#4166e6">Cloudflare</link>','small'),
]
doc=SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=40,leftMargin=40,topMargin=83,bottomMargin=48,title='Поступашки: Воронка и Результаты',author='Команда Наступашки')
doc.build(story,onFirstPage=frame,onLaterPages=frame)
assert len(PdfReader(OUT).pages)==2,'PDF must fit exactly two pages'
(ROOT/'public').mkdir(exist_ok=True);shutil.copy2(OUT,ROOT/'public/solution.pdf')
print('Updated two-page Funnel solution PDF and UI copy.')
