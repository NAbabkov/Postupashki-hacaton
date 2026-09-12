"""Аудит кейса и календарное сопоставление публичных активностей; без атрибуции."""
from pathlib import Path
from decimal import Decimal
from collections import Counter
import hashlib
import json
import re
import os
import tempfile
import pandas as pd
# Кеш графиков находится во временном каталоге, не требует изменения домашней папки.
os.environ.setdefault('MPLCONFIGDIR', str(Path(tempfile.gettempdir()) / 'postupashki_matplotlib'))
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from IPython.display import display

DATASET_SHA256 = '4e001fc8e1dcd1ab572b14721c4cd9f6b3fa14a4c76f94bb3d050a1adea0f70c'
CORE_CHANNELS = ['postypashki_old', 'algoses', 'chad_protocol', 'postypashki_mems']
SCENARIOS = [0, 3]  # Проверяемые допущения о timezone XLSX, не установленный факт.


def prepare(xlsx_path, posts_path, events_path, output_dir='results_tasks_1_2'):
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    xlsx_path, posts_path, events_path = map(Path, [xlsx_path, posts_path, events_path])
    assert hashlib.sha256(xlsx_path.read_bytes()).hexdigest() == DATASET_SHA256
    raw = pd.read_excel(xlsx_path)
    sales = raw.rename(columns={'Номер студента': 'id', 'Сумма': 'amount', 'Курс': 'course', 'Время': 'datetime'}).copy()
    sales['source_row'] = range(2, len(sales) + 2)
    sales['datetime'] = pd.to_datetime(sales['datetime'])
    assert sales['datetime'].dt.tz is None
    sales['amount_kopecks'] = [int(Decimal(str(v)).quantize(Decimal('.01')) * 100) for v in sales['amount']]
    assert (len(sales), sales.id.nunique(), sales.course.nunique(), int(sales.amount_kopecks.sum())) == (795, 606, 18, 590467167)
    posts = pd.DataFrame([json.loads(x) for x in posts_path.read_text().splitlines() if x.strip()])
    posts['published_at'] = pd.to_datetime(posts.published_at, utc=True)
    assert len(posts) == 182 and not posts.duplicated(['channel_username', 'message_id']).any()
    events = pd.read_csv(events_path, keep_default_na=False)
    assert len(events) == len(posts) and not events.duplicated(['channel_username', 'message_id']).any()
    events['published_at'] = pd.to_datetime(events.published_at, utc=True)
    control = events.merge(posts, on=['channel_username', 'message_id'], validate='one_to_one', suffixes=('_label', '_raw'))
    assert len(control) == 182
    for field in ['post_url', 'published_at', 'text']:
        assert (control[field + '_label'].fillna('') == control[field + '_raw'].fillna('')).all(), field
    assert set(events.marketing_status) <= {'confirmed', 'candidate', 'non_marketing', 'unknown'}
    events['course_list'] = events.mapped_courses.map(json.loads)
    products = set(sales.course)
    assert all(isinstance(x, list) and len(x) == len(set(x)) and set(x) <= products for x in events.course_list)
    events['in_core'] = events.channel_username.isin(CORE_CHANNELS)
    events['is_activity'] = events.marketing_status.isin(['confirmed', 'candidate'])
    events['text_hash'] = events.text.map(lambda t: hashlib.sha256(re.sub(r'\s+', ' ', t).strip().encode()).hexdigest() if t.strip() else None)

    groups = sales.groupby(['id', 'datetime']).agg(lines=('course', 'size'), products=('course', 'nunique'),
        amount_kopecks=('amount_kopecks', 'sum'), min_line=('amount_kopecks', 'min'), max_line=('amount_kopecks', 'max')).reset_index()
    dates = pd.date_range(sales.datetime.min().normalize(), sales.datetime.max().normalize())
    daily = sales.groupby(sales.datetime.dt.normalize()).agg(amount_kopecks=('amount_kopecks', 'sum'),
        sale_lines=('course', 'size'), anonymous_ids=('id', 'nunique')).reindex(dates, fill_value=0)
    daily.index.name = 'day'
    group_count = groups.groupby(groups.datetime.dt.normalize()).size().reindex(dates, fill_value=0)
    daily['candidate_order_groups'] = group_count
    daily['case_amount_rub'] = daily.amount_kopecks / 100
    daily['edge_day'] = daily.index.isin([dates[0], dates[-1]])
    interior = daily.loc[~daily.edge_day]
    weekday = interior.groupby(interior.index.dayofweek).agg(calendar_days=('case_amount_rub', 'size'),
        mean_amount_rub=('case_amount_rub', 'mean'), median_amount_rub=('case_amount_rub', 'median'))
    weekday.index = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    audit = {'rows': len(sales), 'anonymous_ids': int(sales.id.nunique()), 'products': int(sales.course.nunique()),
        'amount_kopecks': int(sales.amount_kopecks.sum()), 'exact_duplicate_rows': int(raw.duplicated().sum()),
        'missing_values': int(raw.isna().sum().sum()), 'candidate_order_groups': len(groups),
        'multi_course_groups': int((groups.lines > 1).sum()),
        'ids_with_multiple_timestamps': int((groups.groupby('id').size() > 1).sum()),
        'posts': len(posts), 'null_text_posts': int(posts.text.isna().sum()),
        'marketing_status_counts_all_channels': dict(Counter(events.marketing_status)),
        'core_activity_posts': int((events.in_core & events.is_activity).sum()),
        'timezone_scenarios_not_facts': SCENARIOS, 'no_individual_attribution': True,
        'inputs_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [xlsx_path, posts_path, events_path]}}

    calendars = []
    course_windows = []
    peak_contexts = []
    peaks = daily.nlargest(4, 'amount_kopecks')
    for offset in SCENARIOS:
        e = events.copy()
        # Продажи оставляем в исходных наивных часах; посты переводим в сценарные часы.
        e['scenario_post_time'] = (e.published_at + pd.Timedelta(hours=offset)).dt.tz_localize(None)
        e['scenario_day'] = e.scenario_post_time.dt.normalize()
        activity = e.loc[e.in_core & e.is_activity]
        # Тематические временные окна, НЕ индивидуальные касания/атрибуционная выручка.
        for event in activity.itertuples():
            moment = event.scenario_post_time
            before_start, after_end = moment - pd.Timedelta(hours=72), moment + pd.Timedelta(hours=72)
            neighbours = activity.loc[(activity.scenario_post_time >= before_start) & (activity.scenario_post_time < after_end)]
            for course in event.course_list:
                course_sales = sales.loc[sales.course == course]
                before = course_sales.loc[(course_sales.datetime >= before_start) & (course_sales.datetime < moment)]
                after = course_sales.loc[(course_sales.datetime >= moment) & (course_sales.datetime < after_end)]
                course_windows.append(dict(post_url=event.post_url, channel_username=event.channel_username,
                    message_id=event.message_id, course=course, course_match_status=event.course_match_status,
                    scenario_post_time=moment, scenario_sales_utc_offset_hours=offset,
                    before_72h_amount_kopecks=int(before.amount_kopecks.sum()), after_72h_amount_kopecks=int(after.amount_kopecks.sum()),
                    before_72h_lines=len(before), after_72h_lines=len(after),
                    fits_observed_time_bounds=bool(before_start >= sales.datetime.min() and after_end <= sales.datetime.max()),
                    other_observed_activity_posts_around=max(len(neighbours) - 1, 0),
                    interpretation='Тематическое окно; не выручка от поста. Окна разных публикаций пересекаются.'))
        calendar = daily.copy()
        for status in ['confirmed', 'candidate']:
            counts = activity.loc[activity.marketing_status == status].groupby('scenario_day').size()
            calendar[status + '_observed_posts'] = counts.reindex(dates, fill_value=0)
        calendar['distinct_activity_texts'] = activity.groupby('scenario_day').text_hash.nunique().reindex(dates, fill_value=0)
        calendar['scenario_sales_utc_offset_hours'] = offset
        calendars.append(calendar.reset_index())
        for peak_day, row in peaks.iterrows():
            context = activity.loc[(activity.scenario_day >= peak_day - pd.Timedelta(days=2)) & (activity.scenario_day <= peak_day)].copy()
            context['peak_day'] = peak_day
            context['peak_case_amount_rub'] = row.case_amount_rub
            context['scenario_sales_utc_offset_hours'] = offset
            peak_contexts.append(context)
    calendar = pd.concat(calendars, ignore_index=True)
    course_windows = pd.DataFrame(course_windows)
    course_windows['before_72h_case_amount_rub'] = course_windows.before_72h_amount_kopecks / 100
    course_windows['after_72h_case_amount_rub'] = course_windows.after_72h_amount_kopecks / 100
    peak_context = pd.concat(peak_contexts, ignore_index=True) if peak_contexts else pd.DataFrame()
    peak_mix = sales.loc[sales.datetime.dt.normalize().isin(peaks.index)].groupby([sales.datetime.dt.normalize(), 'course']).agg(
        amount_kopecks=('amount_kopecks', 'sum'), sale_lines=('id', 'size')).reset_index().rename(columns={'datetime': 'day'})
    peak_mix['case_amount_rub'] = peak_mix.amount_kopecks / 100

    # Диагностика несогласованности: в файле продукты с суффиксом «про» были раньше объявления.
    named_pro = sales.loc[sales.course.str.casefold().str.endswith('про')]
    launch_post = posts.loc[(posts.channel_username == 'postypashki_old') & (posts.message_id == 1859)].iloc[0]
    pro_before = []
    for offset in SCENARIOS:
        announcement = (launch_post.published_at + pd.Timedelta(hours=offset)).tz_localize(None)
        prev = named_pro.loc[named_pro.datetime < announcement]
        t = prev.groupby('course').agg(sale_lines=('id', 'size'), anonymous_ids=('id', 'nunique'),
            amount_kopecks=('amount_kopecks', 'sum'), first_record=('datetime', 'min')).reset_index()
        t['case_amount_rub'] = t.amount_kopecks / 100
        t['scenario_sales_utc_offset_hours'] = offset
        t['announcement_time_in_scenario'] = announcement
        t['announcement_post_url'] = launch_post.post_url
        pro_before.append(t)
    pro_before = pd.concat(pro_before, ignore_index=True)

    # Независимое соединение календаря не должно размножать строки продаж или сумму.
    assert int(daily.amount_kopecks.sum()) == audit['amount_kopecks']
    for offset, c in calendar.groupby('scenario_sales_utc_offset_hours'):
        assert len(c) == len(dates) and int(c.amount_kopecks.sum()) == audit['amount_kopecks']
    daily.to_csv(out / 'sales_daily.csv', encoding='utf-8-sig')
    groups.to_csv(out / 'candidate_order_groups.csv', index=False, encoding='utf-8-sig')
    weekday.to_csv(out / 'weekday_normalized.csv', encoding='utf-8-sig')
    calendar.to_csv(out / 'calendar_join.csv', index=False, encoding='utf-8-sig')
    course_windows.to_csv(out / 'post_course_windows.csv', index=False, encoding='utf-8-sig')
    peak_context.drop(columns=['course_list'], errors='ignore').to_csv(out / 'peak_context.csv', index=False, encoding='utf-8-sig')
    peak_mix.to_csv(out / 'peak_product_mix.csv', index=False, encoding='utf-8-sig')
    pro_before.to_csv(out / 'pro_before_announcement.csv', index=False, encoding='utf-8-sig')
    (out / 'validation.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
    return dict(sales=sales, posts=posts, events=events, groups=groups, daily=daily, weekday=weekday,
        calendar=calendar, peaks=peaks, peak_context=peak_context, peak_mix=peak_mix, pro_before=pro_before,
        course_windows=course_windows, audit=audit, out=out)


def show_audit(r):
    print('Задача 1. Онлайн-курсы: аудит исходного файла и единиц анализа.')
    a = r['audit']
    print(f"{a['rows']} строк; {a['anonymous_ids']} ID; {a['products']} продуктов; сумма кейса {a['amount_kopecks']/100:,.2f} руб.")
    print(f"{a['candidate_order_groups']} групп ID+время, {a['multi_course_groups']} многокурсовых. Группы не доказанные заказы.")
    print(f"{a['ids_with_multiple_timestamps']} ID имеют несколько времён записи; это не доказанное число повторных заказов.")
    print('Бандлы не удаляли и суммы повторно не делили. Средняя строка не называется средним чеком.')
    display(r['peaks'][['case_amount_rub', 'sale_lines', 'anonymous_ids', 'candidate_order_groups']])
    print('Дни недели: средние/медианы на календарный день, без двух крайних дней выгрузки. Полнота внутренних дней не доказана.')
    display(r['weekday'].round(2))


def show_history(r):
    print('Задача 2. Сохранённая публичная история и проверяемая семантическая разметка.')
    print('confirmed/candidate относятся к продвижению Поступашек; это не факт оплаты размещения.')
    counts = pd.crosstab(r['events'].channel_username, r['events'].marketing_status)
    display(counts)
    e = r['events']
    focus = e.loc[e.in_core & e.is_activity & e.tags.str.contains('discount|launch|free_event')]
    print('Акции, объявления запусков и бесплатные события (фрагмент; полный файл marketing_events.csv):')
    representative_urls = ['https://t.me/postypashki_mems/1373', 'https://t.me/postypashki_old/1838',
        'https://t.me/postypashki_old/1859', 'https://t.me/postypashki_mems/1398',
        'https://t.me/postypashki_old/1874', 'https://t.me/postypashki_mems/1412', 'https://t.me/postypashki_old/1887']
    display(focus.loc[focus.post_url.isin(representative_urls),
        ['published_at', 'channel_username', 'tags', 'mapped_courses', 'evidence_text', 'post_url']])
    print('27 постов связанного школьного направления сохранены; в основной календарь взрослых продуктов оно не включено автоматически.')
    print('Удалённые публикации, полный список внешних рекламодателей, персональные переходы и расходы не восстановлены.')


def show_connection(r):
    print('Календарное сопоставление: продажи и наблюдаемые активности, без источника отдельного покупателя.')
    print('Сценарии timezone XLSX: UTC+0 и UTC+3. Оба — допущения; часовой пояс остаётся неизвестным.')
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10})
    fig, axes = plt.subplots(3, 1, figsize=(13, 10), sharex=True, gridspec_kw={'height_ratios': [2, 1, 1]})
    d = r['daily']
    axes[0].bar(d.index, d.case_amount_rub / 1000, color='#3468a0')
    axes[0].set_ylabel('Сумма кейса, тыс. руб.')
    axes[0].set_title('Динамика данных кейса и публичных активностей. Совпадение не доказывает эффект рекламы.')
    for day in r['peaks'].index:
        axes[0].annotate(day.strftime('%d.%m'), (day, d.loc[day, 'case_amount_rub'] / 1000), xytext=(0, 5), textcoords='offset points', ha='center', fontsize=9)
    for ax, offset in zip(axes[1:], SCENARIOS):
        c = r['calendar'].loc[r['calendar'].scenario_sales_utc_offset_hours == offset]
        ax.bar(c.day, c.confirmed_observed_posts, label='Подтверждённое содержание', color='#da8b35')
        ax.bar(c.day, c.candidate_observed_posts, bottom=c.confirmed_observed_posts, label='Кандидаты', color='#ddd0b7')
        ax.set_ylabel(f'Посты\nUTC+{offset}: сценарий')
        ax.legend(loc='upper left', fontsize=8)
    axes[-1].xaxis.set_major_locator(mdates.DayLocator(interval=3))
    axes[-1].xaxis.set_major_formatter(mdates.DateFormatter('%d.%m'))
    for ax in axes:
        ax.grid(axis='y', alpha=.18)
    fig.autofmt_xdate(rotation=35)
    fig.tight_layout()
    fig.savefig(r['out'] / 'calendar.png', dpi=160)
    if plt.get_backend().lower() != 'agg':
        plt.show()
    plt.close(fig)
    print('Топ-дни по продуктам (сумма исходных строк; покупатели разных продуктов могут пересекаться):')
    mix = r['peak_mix'].sort_values(['day', 'case_amount_rub'], ascending=[True, False]).groupby('day').head(4)
    display(mix[['day', 'course', 'case_amount_rub', 'sale_lines']])
    print('Посты в календарном контексте пиков: день пика и два предыдущих дня. Часть постов дня пика могла быть позже части покупок.')
    context = r['peak_context']
    display(context.loc[context.scenario_sales_utc_offset_hours == 3,
        ['peak_day', 'scenario_post_time', 'channel_username', 'marketing_status', 'tags', 'evidence_text', 'post_url']].head(18))
    print('Соединение ПО ПРОДУКТУ и времени: 72 часа до/после публикации. Это исследовательское окно, не выбранное окно атрибуции.')
    print('family_candidate означает предполагаемое соответствие линейке, а не точное соответствие продукту.')
    print('Суммы разных публикаций не складывать: одни строки покупок попадают в несколько пересекающихся окон.')
    anchors = ['https://t.me/postypashki_mems/1373', 'https://t.me/postypashki_old/1859', 'https://t.me/postypashki_mems/1412']
    windows = r['course_windows'].loc[r['course_windows'].post_url.isin(anchors)]
    window_summary = windows.groupby(['post_url', 'scenario_sales_utc_offset_hours', 'course_match_status']).agg(
        before_72h_case_amount_rub=('before_72h_case_amount_rub', 'sum'),
        after_72h_case_amount_rub=('after_72h_case_amount_rub', 'sum'),
        before_lines=('before_72h_lines', 'sum'), after_lines=('after_72h_lines', 'sum'),
        fits_observed_time_bounds=('fits_observed_time_bounds', 'all'),
        other_activity_posts=('other_observed_activity_posts_around', 'max')).reset_index()
    display(window_summary)
    print('Проверка объявления ПРО 22.08: продажи продуктов с суффиксом «про» уже есть раньше него.')
    display(r['pro_before'][['course', 'sale_lines', 'case_amount_rub', 'first_record', 'scenario_sales_utc_offset_hours']])
    print('Временные совпадения — кандидаты для исследования; реальные продажи по рекламодателям и ROMI здесь не рассчитаны.')
    print('CSV, проверки и график сохранены:', str(r['out'].resolve()))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', default='данные')
    parser.add_argument('--output-dir', default='результаты')
    args = parser.parse_args()
    root = Path(args.data_dir)
    result = prepare(root / 'base.xlsx', root / 'marketing_history_20260804_20260910.jsonl', root / 'marketing_events.csv', args.output_dir)
    show_audit(result)
    show_history(result)
    show_connection(result)
