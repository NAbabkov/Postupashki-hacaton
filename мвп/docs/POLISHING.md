# Финальная доработка — 12.09.2026

Продукт: **Поступашки**. Команда: **Наступашки**.

## Что изменено

Добавлен исходный aiogram-бот команды из Downloads в `bot/bot.py`; изолированные зависимости и запуск одной командой. Календарь и lifecycle выпущенных ссылок сохранены. Payment/refund, bot start attribution и все четыре модели сохранены.

Бот читает TELEGRAM_BOT_TOKEN из `bot/.env` (совместим с прежним BOT_TOKEN), пишет CSV рядом с собой в UTC, показывает кнопку «Перейти к покупке» и направляет к https://t.me/menshe_treh. Кнопка содержит fingerprint источника своего сообщения: открытие другого поста не меняет источник клика по старой кнопке. Без источника — Unknown. Preview test_* исключён из статистики, и сайт исключает его из боевого импорта. Кнопка не регистрирует Payment.

README содержит две бизнес-диаграммы, инструкции и ограничения. Обновлён двухстраничный PDF с цветной цепочкой и явным «НЕ ОПЛАТА». Создана презентация на 11 слайдов: AS IS / TO BE, данные, три экрана, четыре модели, синтетический пример распределения, ROAS/ROMI и ограничения.

## Почему локально не отвечал Start

При проверке исходник находился только в Downloads и отсутствовал в репозитории; локальных Python-процессов не было. Downloads/.env отсутствовал, токен не был настроен в доступном окружении проекта. Worker не запускает Python из Downloads. Поэтому переход по /r создавал web_visit, но не запускал бота и не создавал bot start в D1.

Это подтверждённый диагноз локального запуска. Состояние возможного удалённого процесса сокомандников без токена не проверялось. Автоматического импорта CSV нет: после работы бота его events.csv необходимо загрузить в «Воронке».

## Как запускается теперь

По явному условию задания «исходник вне репозитория» выбран вариант B: local polling; Python в Worker не переносился. **Ноутбук должен быть включён.** Бот не активирован: токен отсутствует. Вставить его в ignored `bot/.env`:

```env
TELEGRAM_BOT_TOKEN=значение_из_BotFather
TELEGRAM_BOT_USERNAME=tracker_marketing_bot
```

Из папки мвп:

```bash
pnpm bot:check
pnpm bot:start
```

Без pnpm: `bash scripts/run_bot.sh`. Установлено bot/.venv; launcher при первом запуске устанавливает зависимости в отдельное окружение, до этого проверяет наличие токена. Диагностика использует только getMe/getWebhookInfo; не читает getUpdates и не отправляет сообщения. Активный webhook автоматически не удаляется, несовпадающий username блокирует запуск. Если teammate уже запустил polling, вторую копию запускать нельзя.

## Публикация

Реальный сайт: https://demo-komandy-postupili.postupili-demo.workers.dev/
PDF: https://demo-komandy-postupili.postupili-demo.workers.dev/solution.pdf
PPTX: https://demo-komandy-postupili.postupili-demo.workers.dev/solution.pptx

Название в интерфейсе и метаданных — «Наступашки». Физический Worker / D1 / account subdomain сохранён для совместимости уже выпущенных ссылок и автопоиска точного URL. Новый Worker-name приведён только в example-конфигурации. Финальная версия Worker: 52140aa7-065d-42de-a5b3-894bde80940a. Публичные PDF/PPTX побайтно совпадают с проверенными файлами (docs/polishing-assets-results.json). Ничего не покупалось. Новых миграций нет; пользовательские данные не удалялись. Git commit/push не выполнялся.

## Приёмка за 2 минуты (после настройки и запуска бота)

1. Открыть сайт, войти в командный режим, открыть новое live-размещение в календаре.
2. Скопировать обычную /r-ссылку, открыть её в Telegram и нажать Start. Preview не использовать для боевого подсчёта.
3. Убедиться в ответе бота; нажать «Перейти к покупке» и проверить адрес менеджера.
4. В «Воронке» загрузить bot/events.csv: preview → commit; проверить новые Start / намерение, отсутствие автоматической оплаты. Повторный импорт не удваивает события.
5. После подтверждения менеджером создать Payment по намерению с верным курсом и суммой; проверить refund. В демонстрации использовать явные синтетические данные.
6. В «Результатах» переключить First/Last/Linear/Decay, сверить сумму; открыть PDF/PPTX и README links.

## Проверки этого запуска

| Проверка | Результат |
|---|---|
| Typecheck | PASS |
| Tests приложения | PASS — 56/56 |
| Offline bot handlers | PASS — 8 проверок, без Telegram-запросов |
| Lint | PASS |
| Production build / Wrangler dry-run | PASS |
| Локальные API tests | PASS — 45/45, собственные fixtures очищены |
| Внешний smoke | PASS — 18/18 |
| Диагностика / запуск без токена | PASS — понятный отказ, секрет не выводится |
| Telegram getMe / webhook check | НЕ ЗАПУСКАЛ — нет токена |
| Реальный Telegram Start / purchase click | НЕ ЗАПУСКАЛ — проверяет владелец |
| PDF | PASS — ровно 2 страницы, обе просмотрены |
| PPTX | PASS — пакет, геометрия, шрифты, editable tables/chart, повторный import; все 11 слайдов просмотрены |

Первый внешний smoke остановился на локальной ошибке CA системного Python; повтор с доверенным CA certifi прошёл. Сборка предупреждает о размере JS chunk; сборка успешна.

Результаты API/smoke: docs/api-test-results.json, docs/public-smoke-results.json. Приватная проверка PPTX: tmp/presentation/validation-final.json. В PowerPoint/Google Slides вручную не открывалось.

## Что осталось проверить руками

Реальный Telegram Start, кнопку «Перейти к покупке», отображение новых импортированных событий, визуальный flow сайта и PDF/README links. Всегда включённый bot и автоматическая доставка событий — следующий этап, не выполненная часть этого релиза.

## Основные изменённые и добавленные файлы

- `../README.md`
- `.gitignore`
- `README.md`
- `app/layout.tsx`
- `app/page.tsx`
- `deployment/cloudflare.example.json`
- `package.json`
- `scripts/build_pdf.py`
- `scripts/run_bot.sh`
- `scripts/check_telegram_bot.py`
- `scripts/test_bot.py`
- `bot/bot.py`
- `bot/requirements.txt`
- `bot/.env.example`
- `bot/.gitignore`
- `output/pdf/solution.pdf`
- `public/solution.pdf`
- `output/presentation/Nastupali_Solution_Final.pptx`
- `public/solution.pptx`
- `docs/POLISHING.md`
- `docs/polishing-assets-results.json`

Локальные ignored: bot/.env (пустой шаблон без токена), bot/.venv, tmp/presentation. Исходные таблицы, CSV и исследования сохранены.

## Удалённые файлы

Только промежуточные файлы, созданные генератором презентации в этом запуске:

- `.chart-data-LuLdeM/candidate.pptx`
- `.chart-data-LuLdeM/chart-data-snapshot.json`
- `.chart-data-pR59EI/candidate.pptx`
- `.chart-data-pR59EI/chart-data-snapshot.json`
- `.chart-data-HEUabX/candidate.pptx`
- `.chart-data-HEUabX/chart-data-snapshot.json`
- `.chart-data-dXGzHA/candidate.pptx`
- `.chart-data-dXGzHA/chart-data-snapshot.json`

Предварительные PPTX перенесены в ignored tmp/presentation. Существующие исходники и tracked файлы не удалялись.
