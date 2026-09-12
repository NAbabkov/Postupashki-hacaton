"""Two-page solution, Cyrillic fonts, reproducible and independent of paid services."""
from pathlib import Path
import shutil
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
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
def frame(canvas,doc):
 w,he=A4;canvas.setFillColor(NAVY);canvas.rect(0,he-62,w,62,fill=1,stroke=0)
 canvas.setFont('Bold',14);canvas.setFillColor(colors.white);canvas.drawString(40,he-31,'Поступашки / измеримый маркетинг')
 canvas.setFont('Body',9);canvas.setFillColor(colors.HexColor('#bccbf1'));canvas.drawRightString(w-40,he-31,'РЕШЕНИЕ КЕЙСА · MVP')
 canvas.setStrokeColor(BORDER);canvas.line(40,36,w-40,36);canvas.setFillColor(MUTED);canvas.setFont('Body',8)
 canvas.drawString(40,23,'История, оценочная атрибуция и отдельное синтетическое демо')
 canvas.drawRightString(w-40,23,str(doc.page)+' / 2')
story=[
 p('От размещения до подтверждённой продажи','title'),
 p('<b>Задача.</b> Планировать маркетинг, сохранять источник каждого поста и сравнивать экономику подтверждённых оплат. MVP: <b>Календарь / Воронка / Результаты</b>. Calendar v3 сохранён; Tracking и Leads/Payments объединены, CRM и ручные стадии убраны.'),
 h('Материалы кейса и границы данных'),
 box('<b>795 строк оплат · 606 анонимных ID · 18 курсов.</b><br/>Telegram: 182 наблюдаемых поста пяти каналов, 62 проверенных в календаре. Colab: сохранены 23 исходные EDA-ячейки.'),
 Spacer(1,8),
 p('XLSX: курс, сумма и время за 04.08-10.09.2026. Часть сумм приближена, часовой пояс неизвестен, строка курса не обязательно заказ. Нет исторических лидов, рекламных расходов и источников покупателей. Telegram - наблюдаемый снимок, полнота архива не доказана.'),
 p('Синтетическое демо: 13 размещений, 94 web-события, 150 bot-событий (96 start / 54 payment_click), 66 bot-пользователей и 18 оплат. Повторные, organic и unmapped события проверяют дедупликацию. Исходные исторические суммы и даты сохранены; вымышленные и live данные разделены.'),
 h('Календарь и стабильные ссылки'),
 box('<b>Кампания → размещение → /r/ID → Telegram-пост → web_visit → бот команды → импорт events.csv → воронка.</b><br/>Платёж регистрируется отдельно после подтверждения менеджером.'),
 Spacer(1,8),
 p('Команда выбирает кампанию, канал, курсы, дату UTC, бюджет и текст. У размещения свой стабильный botTrackingKey. После выпуска нельзя менять кампанию, канал или набор курсов; повторный выпуск сохраняет адрес. Номер будущего Telegram-поста не нужен для ключа.'),
 p('Источник telegram|ASCII_channel|short_key кодируется UTF-8 base64url, start не длиннее 64 символов. Сайт сохраняет web_visit перед 302 в <b>@tracker_marketing_bot</b>. Ссылка действует до обнаружения публикации. Preview передаёт test_* и не пишет web-событие; исторические и отменённые ссылки отклоняются.'),
 p('Автопоиск публичного поста проверяет точную ссылку в окне -15 минут / +2 часа к плану. Сохраняет план и факт отдельно. Проверки у команды каждые 30 секунд, Cloudflare Cron каждые 5 минут. Ручной адрес второстепенный и имеет отдельное основание. Cron ищет публикации, <b>не загружает CSV бота</b>.'),
 h('Публичный доступ и хранение'),
 p('Cloudflare Workers / D1 на существующем бесплатном workers.dev. Просмотр без ChatGPT, записи по подписанной HttpOnly session команды. Новых SQL-миграций нет: BotEvent / PurchaseIntent - нормализованный view поверх прежней workspace_records; старые CRM записи не определяют live-воронку.'),
 p('<link href="https://demo-komandy-postupili.postupili-demo.workers.dev" color="#4166e6"><b>demo-komandy-postupili.postupili-demo.workers.dev</b></link><br/>Домены, платные планы, сервисы и списания не покупались.','small'),
 PageBreak(),
 p('Воронка, атрибуция и экономика','title'),
 h('События бота и подтверждение оплаты'),
 p('events.csv: timestamp,user_id,username,event,source_code,social_network,channel,content_id. Импорт вручную: preview → commit, до 2 МБ / 5000 строк; для даты без timezone нужен явный offset. Telegram ID преобразуется HMAC-SHA256 с серверным salt; raw ID, username и CSV не сохраняются. Полный source_code сопоставляется с размещением; неизвестный источник не заимствуется из прошлых событий.'),
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
 p('<b>Проверки:</b> 56 тестов движка/контракта/воронки/публикаций/экспорта, 45 локальных API-проверок; typecheck, application lint, production build, внешний smoke. В браузере: четыре модели, сохранение суммы, ручная Payment, возврат и reload. До импорта CSV нули означают отсутствие загруженных наблюдений.','small'),
 p('<link href="https://github.com/NAbabkov/Postupashki-hacaton" color="#4166e6">Репозиторий команды</link> · <link href="https://core.telegram.org/bots/features#deep-linking" color="#4166e6">Telegram contract</link> · <link href="https://developers.cloudflare.com/workers/" color="#4166e6">Cloudflare</link>','small'),
]
doc=SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=40,leftMargin=40,topMargin=83,bottomMargin=48,title='Поступашки: Воронка и Результаты',author='Команда Поступили')
doc.build(story,onFirstPage=frame,onLaterPages=frame)
assert len(PdfReader(OUT).pages)==2,'PDF must fit exactly two pages'
(ROOT/'public').mkdir(exist_ok=True);shutil.copy2(OUT,ROOT/'public/solution.pdf')
print('Updated two-page Funnel solution PDF and UI copy.')
