# Приёмка Funnel / Attribution после Calendar v3

Реализована полная спецификация `Postupashki_Funnel_Attribution_Implementation_Spec.pdf` (17 страниц). Порядок: normalized data → reporting / attribution → тесты → UI / документы. Предыдущая календарная спецификация сохранена.

## Результат

- Навигация: Календарь / Воронка / Результаты. Tracking + Leads/Payments объединены; CRM/Kanban и ручных стадий нет.
- Start и payment_click импортируются из events.csv существующего бота. Нормализованы BotEvent и PurchaseIntent. PurchaseIntent — намерение купить / передача менеджеру, не деньги.
- Подтверждённый Payment регистрируется отдельно по заявке. Вне бота — явный Unknown с null userKey. ID уникален; режим, пользователь, курс, дата и сумма проверяются сервером. Есть частичный и полный refund.
- First Touch / Last Touch / Linear / Time Decay сохранены и объяснены. Live/demo используют bot start того же userKey, совместимый курс и окно до оплаты. Web visit и payment_click исключены.
- Дедупликация по placementId до Allocation; два размещения одной кампании сохраняют отдельные credits. Фильтры и агрегация следуют после полного распределения. Unknown не раздаётся другим источникам.
- История остаётся сценарной оценкой с постоянным предупреждением: контакт покупателя с публикацией неизвестен. Есть coverage / задержка и опциональные family-гипотезы с объяснением коэффициента.
- Календарь, выпуск и неизменность ссылок, bot source mapping, preview и обнаружение публикаций сохранены. Исправлены только два пояснения карточки для совместимости с новым значением заявки.

## Миграции

**Новых SQL-миграций нет.** Используется прежняя D1 JSON-таблица workspace_records; календарная миграция 0000 не менялась в этой перестройке.

Нормализация на чтении, без разрушительной перезаписи production:

1. Старые сохранённые bot events проектируются в BotEvent с HMAC userKey; live browser identity никогда не превращается в Telegram identity.
2. PurchaseIntent — view первого payment_click по `(mode,userKey,placementId,sourceCode)`. ID зависит от tuple, не от времени первой импортированной строки; более ранний CSV не ломает Payment-связь.
3. Historical userId сохраняется как historicalBuyerId, Telegram userKey у истории null. Все 795 исходных строк, суммы, курсы и даты остаются прежними.
4. Seed демо явно переведён на 94 web-события + 150 bot events (96 start / 54 intent), 66 bot-пользователей и прежние 18 оплат. Старый CRM seed пуст. Повторные/organic/unmapped события вымышленные.
5. Старые D1 Lead records не удаляются. Public API возвращает leads=[]; UI и write actions CRM отключены. Синтетический адаптер связывает только явно старое demo; live источник не угадывает.

## Изменённые файлы этой перестройки

Это список относительно уже выполненного Calendar v3, а не весь накопленный git diff.

| Файлы | Назначение |
|---|---|
| lib/types.ts | BotEvent, PurchaseIntent, Payment userKey / purchaseIntentId, Allocation channel |
| lib/funnel-data.ts (новый) | Нормализация, stable intent ID, masking, refunds, адаптер demo |
| lib/funnel-report.ts (новый) | Funnel raw/unique, объединение людей, cohorts, группировки, диагностика |
| lib/attribution.ts | Все четыре модели по bot start, placement dedup, Unknown, warning |
| lib/reporting.ts | Allocation перед фильтрами, экономики / сводки по placement, intent cohorts, historical coverage |
| lib/payments.ts (новый) | Валидация подтверждённой Payment и refund |
| lib/store.ts | Нормализованный workspace поверх прежней D1 |
| lib/bot-funnel.ts | Календарный projection новых bot events без изменения lifecycle |
| data/seed.json | Явные синтетические bot events, Payment-связи, historicalBuyerId |
| app/api/payments/route.ts (новый) | POST отдельной подтверждённой оплаты, атомарная уникальность ID |
| app/api/payments/[id]/refund/route.ts (новый) | PATCH суммы возврата |
| app/api/workspace/route.ts | Совместимые payment/refund aliases, public privacy, отключение CRM actions |
| app/api/visit/route.ts | Удалённый ручной lead flow отвечает 410 после auth |
| app/api/ingest/route.ts | Доверенный импорт подтверждённого Payment по explicit intent, без Lead stage |
| components/marketing/funnel.tsx (новый) | Общий экран, 6 KPI, источники, CSV, оплаты / refund, статус импорта |
| components/marketing/payment-dialog.tsx (новый) | Выбор заявки / фактического курса / Unknown, ввод Payment |
| components/marketing/source-drawer.tsx (новый) | Источник, masked последние пользователи, события, регистрация оплаты |
| components/marketing/results.tsx (новый) | Модели, объяснения / coverage, финансовые результаты / Allocation drawer |
| components/marketing/bot-import.tsx | Название кнопки импорта на новом экране |
| components/marketing/common.tsx | Удалён список ручных CRM стадий |
| components/marketing/calendar.tsx | Только согласование текста карточки с PurchaseIntent / bot-start attribution |
| components/marketing/analytics.tsx, leads.tsx, tracking.tsx, sources.tsx (удалены) | Старые отдельные экраны и CRM |
| app/page.tsx | Три экрана, payment/refund endpoints, normalized initial data |
| app/globals.css | Responsive Funnel / coverage / allocations, удаление Kanban CSS |
| scripts/test_funnel.ts (новый) | Funnel / модель / Payment / refund regression tests |
| scripts/test_attribution.ts, scripts/test_reporting.ts | Обновлённый контракт start / intent / placement credits |
| scripts/run_tests.mjs | Новые data/reporting/payments модули и тесты |
| scripts/test_api.py | API-проверки BotEvent/PurchaseIntent/Payment/refund/CRM deprecation |
| scripts/smoke_public.py | Public навигация / normalized views / защищённые Payment/refund |
| notebooks/mvp_validation.ipynb | Обновлённый demo контракт, сохранённые выполненные проверки |
| README.md, docs/SOLUTION.md, docs/ACCEPTANCE_FUNNEL.md | Архитектура, формулы, ограничения, миграции, приёмка |
| scripts/build_pdf.py, output/pdf/solution.pdf, public/solution.pdf | Актуальное решение в двух страницах, опубликованная копия |
| docs/validation-results.json, docs/api-validation-results.json, docs/public-smoke-results.json | Машинные результаты проверок |

## Проверки

- 56/56 automated tests: allocation по всем моделям / окнам / часам истории, деньги и бюджеты, placement dedup, repeated start, wrong user/time/course, browser exclusion, unknown identity, partial/full refunds, global unique union, multicourse intent, mapping, stable ID, Payment validation.
- 45/45 локальных API-проверок: auth/CSRF, bot import preview/commit/idempotency/privacy, отдельный Payment, duplicate ID / wrong user / wrong course, явный Unknown, refund limits и net, отключение CRM, preview / отмена / сохранение источника.
- Typecheck, application lint, production build и Worker dry-run проходят. Внешняя проверка опубликованного сайта: 18/18, результат docs/public-smoke-results.json. Vite предупреждает о размере общего client chunk >500 kB; сборка завершается успешно.
- Notebook: все 6 code cells выполнены. Обе страницы PDF отрендерены и визуально проверены.
- GUI: отдельная вымышленная локальная Payment +10 000; проверка нескольких касаний с датой фикстуры после второго start; First/Last выбрали разные размещения, Linear 50/50, Decay 21,6/78,4, суммы неизменны. Refund 3 000 дал Net 7 000; число покупателей не изменилось; после нового открытия запись и refund сохранились. Historical Funnel показывает empty state, Results — warning.
- Все созданные мной API/GUI fixtures удалены точными локальными ключами. Прежние demo-записи не удалялись. Настоящие Telegram сообщения, bot Start и покупки в тестах не выполнялись.

## Короткий e2e checklist команды

1. Создать live размещение и выпустить ссылку. Обычный /r/ID сохраняет web-переход; preview его не сохраняет. Проверить карточку в режиме «Новый запуск» / «Новые данные» и нужный период.
2. В реальном боте запустить source-ссылку и нажать переход к покупке. Получить свежий events.csv от команды бота; preview → commit в «Воронке». Проверить mapping, raw/unique и отсутствие автоматической выручки. Повторить импорт — новых событий нет.
3. По импортированной заявке вручную зарегистрировать подтверждённую оплату; проверить курс / ID. В «Результатах» переключить четыре модели, открыть Payment и сверить 100% суммы долей. Ограничить канал — скрытые credits не передаются выбранному.
4. Внести частичный / полный возврат. Net меняется, starts / intents и факт прежней покупки сохраняются. Открыть сайт заново, проверить persistence.
5. В истории проверить warning и пустую наблюдаемую воронку; в публичной сессии без входа изменения / импорт / refund недоступны.

## Почему переход по новой ссылке не сразу даёт bot-показатели

Сайт сразу записывает web_visit. Telegram открывается отдельно; start — это событие, которое записал бот, а payment_click — нажатие его кнопки. CSV на сервере бота пока не синхронизируется автоматически: нужен ручной импорт. Cloudflare Cron занимается поиском публикаций. До импорта bot-ноль означает отсутствие загруженных наблюдений, а не потерянный web-переход.

Проверка реального нового размещения «тест 1» 12.09.2026: на публичном сервере присутствовал 1 web_visit, bot-событий / CSV-импортов не было. Запись пользователя сохранена.

Переход из общего календаря теперь выбирает live при наличии выбранных live-размещений; campaign/course фильтры учитываются. Ранее такой переход выбирал demo и скрывал новый запуск.

Финальная публикация: https://demo-komandy-postupili.postupili-demo.workers.dev, Worker version `132e7c95-befc-412a-be81-76e07c76574c`. Внешний GUI подтвердил автоматический выбор live, сохранённый период, строку «тест 1» с 1 web-переходом / 1 браузером и сообщение об отсутствии CSV-импорта. Production записи пользователя сохранены.
