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
 'title':ParagraphStyle('title',fontName='Bold',fontSize=22,leading=26,textColor=NAVY,spaceAfter=13),
 'h':ParagraphStyle('h',fontName='Bold',fontSize=12,leading=16,textColor=NAVY,spaceBefore=9,spaceAfter=6),
 'body':ParagraphStyle('body',fontName='Body',fontSize=10.3,leading=13.8,textColor=NAVY,spaceAfter=6),
 'small':ParagraphStyle('small',fontName='Body',fontSize=8.8,leading=12,textColor=MUTED,spaceAfter=6),
 'stat':ParagraphStyle('stat',fontName='Bold',fontSize=18,leading=22,textColor=BLUE),
 'label':ParagraphStyle('label',fontName='Body',fontSize=8.8,leading=12,textColor=MUTED),
}
def p(text,kind='body'):
 text=text.replace('—','-').replace('–','-').replace('\u2011','-').replace('₽','руб.')
 return Paragraph(text,styles[kind])
def h(text):return p(text,'h')
def box(text):
 t=Table([[p(text)]],colWidths=[515]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#edf2ff')),('BOX',(0,0),(-1,-1),.4,BORDER),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),5)]));return t
def frame(canvas,doc):
 w,he=A4;canvas.setFillColor(NAVY);canvas.rect(0,he-62,w,62,fill=1,stroke=0)
 canvas.setFont('Bold',14);canvas.setFillColor(colors.white);canvas.drawString(40,he-31,'Поступашки / измеримый маркетинг')
 canvas.setFont('Body',9);canvas.setFillColor(colors.HexColor('#bccbf1'));canvas.drawRightString(w-40,he-31,'РЕШЕНИЕ КЕЙСА · MVP')
 canvas.setStrokeColor(BORDER);canvas.line(40,36,w-40,36);canvas.setFillColor(MUTED);canvas.setFont('Body',8)
 canvas.drawString(40,23,'История, оценочная атрибуция и отдельное синтетическое демо')
 canvas.drawRightString(w-40,23,str(doc.page)+' / 2')
story=[
 p('От маркетингового поста к оплате','title'),
 p('<b>Задача.</b> «Поступашки» продают онлайн-курсы для стажировок и работы. Нужно связать размещение с заявкой на конкретный курс и подтверждённой оплатой, затем оценить экономику кампании. Уникальная ссылка сохраняет источник входа; модель распределяет вклад нескольких входов.'),
 h('Что получено из материалов кейса'),
]
stats=Table([[p('795','stat'),p('606','stat'),p('182 → 62','stat')],[p('строк оплат / 18 курсов','label'),p('уникальных ID в кейсе','label'),p('наблюдаемых постов / календарь','label')]],colWidths=[171,172,172])
stats.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#f5f7fc')),('TOPPADDING',(0,0),(-1,0),11),('BOTTOMPADDING',(0,1),(-1,1),11),('LEFTPADDING',(0,0),(-1,-1),12)]));story.extend([stats,Spacer(1,9)])
story.extend([
 p('<b>XLSX:</b> курс, ID, сумма и время за 04.08-10.09.2026. Суммы частично приближены, часовой пояс неизвестен; строка курса не обязательно заказ. Нет исторических входов, заявок и рекламных расходов. Таблица нужна для проверки правил и сумм, а не для угадывания источника.'),
 p('<b>Telegram:</b> парсер публичной истории пяти каналов. Проверены 59 карьерных постов и 3 с явным «К ВУЗу». Полнота архива и платность не установлены. <b>Colab:</b> сохранены 23 ячейки первичного анализа коллеги. Сырые файлы и SHA-256 включены в проект.'),
 p('<b>Демо v2:</b> 13 размещений, 60 посетителей, 48 заявок, 136 событий и 16 оплат с seed 20260912. Вымышлены бюджеты, каналы и исходы; есть непокупатели, повторные входы, разные кампании курса, задержки, возврат и неизвестный источник. Старые ID сюда не подмешиваются.'),
 h('Система выпуска ссылок в календаре'),
 box('<b>Размещение → выпуск уникальной ссылки → пост → переход → заявка на курс → подтверждённая оплата → атрибуция и экономика.</b> Связь сохраняется на каждом этапе.'),
 Spacer(1,7),
 p('Команда создаёт карточку: кампания, канал, курсы, даты, реклама, ответственный и текст. Кнопка выпускает адрес /r/ID, который вставляется в пост. После публикации команда сохраняет Telegram-адрес поста и ставит статус «Опубликовано». Повторный выпуск возвращает тот же адрес; до публикации вход неактивен.'),
 p('Переход записывается с ID размещения и случайным ID браузера. Форма внутри приложения создаёт заявку для пары «посетитель + курс» и сохраняет первый подходящий источник. Менеджер выбирает ID заявки и регистрирует уже подтверждённую оплату. Дубликат оплаты не добавляется; возврат хранится с исходной суммой.'),
 h('Карточка маркетинга и рабочий интерфейс'),
 p('Краткая карточка: кампания, курсы, бюджет, состояние ссылки, переходы, заявки и сумма оплат. Раскрытая: выпуск/копирование, привязка к посту, браузеры, воронка, расходы, ROAS и ROMI. Есть этапы заявок, журнал оплат, CSV и чекбоксы нескольких каналов, курсов и кампаний. Рабочие записи сохраняются в SQLite/D1.'),
 p('Источники: <link href="https://docs.google.com/spreadsheets/d/1tXYSKmijPZF4saVzjcz0m-So8bzkqplK/edit" color="#4166e6">XLSX</link> · <link href="https://colab.research.google.com/drive/1hNiEONvYHZc6I8RsTpyMKk5FHSdOrnfV" color="#4166e6">Colab</link> · <link href="https://t.me/s/postypashki_old" color="#4166e6">публичный Telegram</link> · <link href="https://chatgpt.com/share/6aa525ac-cd04-83ed-9045-28601703f4e4" color="#4166e6">план команды</link>','small'),
 PageBreak(),
 p('Экономика курса и кампании','title'),
 h('Атрибуция: сохраняем входы, объясняем вклад'),
 p('<b>Новые данные:</b> подходят входы того же браузера до оплаты в заданном окне и по купленному курсу. First Touch отдаёт 100% первому, Last Touch последнему, Linear поровну уникальным кампаниям, Time Decay - по весу 2 в степени -(дни / полураспад). Повторы кампании не добавляют доли. Без касаний источник остаётся неизвестным.'),
 p('Заявка учитывается по первому источнику; сумма оплаты - по выбранной модели. Несколько оплат одной заявки не увеличивают число оплативших заявок. Атрибуция считается до фильтров: выбор двух каналов не перераспределяет на них скрытую долю третьего. В карточке оплаты видны полный путь и 100% весов.'),
 p('<b>История:</b> пост до оплаты + явный курс + окно - только оценочное правило. По умолчанию 5 дней, UTC, полураспад 2 дня; гипотезы по линейке выключены. Подходят 176/795 строк при UTC и 165/795 при UTC+3. Это не доказанный источник покупателя; 5 дней в видео были примером.'),
 h('Как считать ROAS и ROMI'),
 p('<b>R</b> - сумма по модели после возвратов, <b>A</b> - реклама, <b>O</b> - прочий маркетинг, <b>M = A + O</b>. Доход до маркетинга <b>C</b>: из каждой оплаты после возврата вычитаются обучение (%), эквайринг (%) и себестоимость оплаты; результат распределяется теми же весами.'),
 box('<b>ROAS = R / A.</b><br/><b>ROMI = (C - M) / M × 100%.</b><br/><b>CPL = M / заявки.</b> <b>CPA по модели = M / сумма долей положительных оплат.</b><br/><b>CR = оплаченные заявки / заявки × 100%.</b> CPA не является CAC нового клиента.'),
 Spacer(1,7),
 p('<b>Пример:</b> оплата 10 000 ₽, обучение 30%, эквайринг 2%, себестоимость 500 ₽ → C = 6 300 ₽. Реклама 5 000 ₽, прочий маркетинг 1 000 ₽ → <b>ROAS 2×, ROMI 5%</b>, результат после маркетинга 300 ₽.'),
 p('Экономика задаётся отдельно по курсам. Реклама суммируется по размещениям; прочие расходы кампании учитываются один раз и делятся пропорционально известной рекламе, иначе поровну. Бюджет многокурсового поста делится по заданным долям; равные доли отмечены как допущение. Основная сводка - <b>кампания × курс</b>; доступны курс, кампания и канал.'),
 p('Неизвестные расходы остаются неизвестными; нулевой знаменатель не даёт ROI. ROMI требует расходов и экономики курса. До конца срока ожидания после размещения показывается «Ожидаем оплаты». Окно атрибуции и срок ожидания независимы. Зрелый нулевой результат при известных расходах может дать -100%.'),
 h('Проверки, ограничения и демонстрация'),
 p('<b>22 тест движка/экономики + 17 проверок API:</b> суммы и веса, курс, время, возвраты, фильтры, расходы, зрелость, выпуск ссылки, привязка к посту и отсутствие дублей. Проверены TypeScript и данные notebook. Реальные списания и платные подписки не выполнялись.'),
 p('Для MVP предполагаем один браузер и сохранение ID заявки до оплаты. Дата расчёта отсекает оплаты; возвраты учтены в текущем состоянии, без прошлого снимка. Фиксированная себестоимость остаётся при возврате; проценты пропорциональны чистой сумме. Налоги и постоянные расходы компании не распределены. Атрибуция не измеряет причинный прирост.','small'),
 p('<link href="https://postupashki-marketing-hacaton.maksimpechenin.chatgpt.site" color="#4166e6"><b>Приватный MVP для владельца</b></link> · <link href="https://github.com/NAbabkov/Postupashki-hacaton" color="#4166e6">репозиторий команды</link> · <link href="https://support.google.com/analytics/answer/10596866" color="#4166e6">Google: атрибуция</link> · <link href="https://corporatefinanceinstitute.com/resources/accounting/roas-return-on-ad-spend/" color="#4166e6">CFI: ROAS</link>','small'),
])
doc=SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=40,leftMargin=40,topMargin=83,bottomMargin=48,title='Поступашки: измеримый маркетинг',author='Команда хакатона')
doc.build(story,onFirstPage=frame,onLaterPages=frame)
assert len(PdfReader(OUT).pages)==2,'PDF must fit exactly two pages'
(ROOT/'public').mkdir(exist_ok=True);shutil.copy2(OUT,ROOT/'public/solution.pdf')
print('Created two-page solution PDF and UI copy.')
