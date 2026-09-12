import asyncio
import base64
import csv
import hashlib
import hmac
import os
from datetime import datetime, timezone
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart, Command
from aiogram.filters.command import CommandObject
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from dotenv import load_dotenv


# ==========================================
# НАСТРОЙКИ
# ==========================================

load_dotenv(Path(__file__).with_name(".env"))

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("BOT_TOKEN")
USERNAME_HASH_SECRET = os.getenv("USERNAME_HASH_SECRET") or TOKEN

ADMIN_ID = os.getenv("ADMIN_ID", "0")

PAYMENT_URL = "https://t.me/menshe_treh"

CSV_FILE = str(Path(__file__).with_name("events.csv"))
BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "tracker_marketing_bot")

if not TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN не найден в bot/.env")

if not USERNAME_HASH_SECRET:
    raise ValueError("USERNAME_HASH_SECRET не найден в .env")

if not ADMIN_ID:
    raise ValueError("ADMIN_ID не найден в .env")

try:
    ADMIN_ID = int(ADMIN_ID)
except ValueError:
    raise ValueError("ADMIN_ID должен быть числом")


# ==========================================
# TELEGRAM
# ==========================================

bot = Bot(token=TOKEN)
dp = Dispatcher()


# ==========================================
# КЛАВИАТУРЫ
# ==========================================

main_keyboard = InlineKeyboardMarkup(
    inline_keyboard=[
        [
            InlineKeyboardButton(
                text="📋 О команде",
                callback_data="team"
            ),
        ],
        [
            InlineKeyboardButton(
                text="❓ Актуальные вопросы",
                callback_data="faq"
            ),
        ],
        [
            InlineKeyboardButton(
                text="Перейти к покупке",
                callback_data="payment"
            ),
        ],
    ]
)


def source_fingerprint(source_code):
    return hashlib.sha256(source_code.encode("utf-8")).hexdigest()[:16] if source_code else "organic"


def keyboard_for_source(source_code):
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Перейти к покупке", callback_data="payment:" + source_fingerprint(source_code))]
    ])


back_keyboard = InlineKeyboardMarkup(
    inline_keyboard=[
        [
            InlineKeyboardButton(
                text="⬅️ Главное меню",
                callback_data="main_menu"
            )
        ]
    ]
)


# ==========================================
# ХЕШИРОВАНИЕ USERNAME
# ==========================================

def hash_username(username: str | None) -> str | None:
    if not username:
        return None

    return hmac.new(
        USERNAME_HASH_SECRET.encode("utf-8"),
        username.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()


# ==========================================
# SOURCE CODE
# ==========================================

def encode_source(source_code: str) -> str:
    encoded = base64.urlsafe_b64encode(
        source_code.encode("utf-8")
    ).decode("utf-8")

    return encoded.rstrip("=")


def decode_source(encoded_source: str) -> str | None:
    try:
        padding = "=" * (-len(encoded_source) % 4)

        decoded = base64.urlsafe_b64decode(
            encoded_source + padding
        ).decode("utf-8")

        return decoded

    except Exception:
        return None


# ==========================================
# РАЗБОР SOURCE CODE
# ==========================================

def parse_source(source_code: str | None):
    if not source_code:
        return None, None, None

    parts = source_code.split("|")

    if len(parts) != 3:
        return None, None, None

    social_network = parts[0].strip()
    channel = parts[1].strip()
    content_id = parts[2].strip()

    return social_network, channel, content_id


# ==========================================
# ГЕНЕРАЦИЯ TRACKING LINK
# ==========================================

def create_tracking_link(source_code: str) -> str:
    encoded_source = encode_source(source_code)

    return (
        f"https://t.me/{BOT_USERNAME}"
        f"?start={encoded_source}"
    )


# ==========================================
# ЗАПИСЬ В CSV
# ==========================================

def save_event(
    user_id: int,
    username: str | None,
    event: str,
    source_code: str | None = None,
    social_network: str | None = None,
    channel: str | None = None,
    content_id: str | None = None,
):
    if event not in {"start", "payment_click"}:
        return

    file_exists = os.path.exists(CSV_FILE)

    fieldnames = [
        "timestamp",
        "user_id",
        "username",
        "event",
        "source_code",
        "social_network",
        "channel",
        "content_id",
    ]

    with open(
        CSV_FILE,
        "a",
        newline="",
        encoding="utf-8",
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=fieldnames,
        )

        if not file_exists:
            writer.writeheader()

        writer.writerow({
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "user_id": user_id,
            "username": hash_username(username),
            "event": event,
            "source_code": source_code,
            "social_network": social_network,
            "channel": channel,
            "content_id": content_id,
        })


# ==========================================
# ПОЛУЧЕНИЕ ИСТОЧНИКА ИЗ ПОСЛЕДНЕГО START
# ==========================================

def get_current_source(user_id: int, fingerprint: str | None = None):
    # The clicked menu owns its source. An old/organic button never borrows another start.
    if not fingerprint or fingerprint == "organic":
        return None, None, None, None
    if not os.path.exists(CSV_FILE):
        return None, None, None, None

    last_start = None

    try:
        with open(
            CSV_FILE,
            "r",
            newline="",
            encoding="utf-8",
        ) as file:

            reader = csv.DictReader(file)

            for row in reader:
                if str(row.get("user_id")) != str(user_id):
                    continue

                if row.get("event") == "start" and source_fingerprint(row.get("source_code") or "") == fingerprint:
                    last_start = row

    except Exception as error:
        print(f"Ошибка чтения CSV: {error}")
        return None, None, None, None

    if not last_start:
        return None, None, None, None

    return (
        last_start.get("source_code") or None,
        last_start.get("social_network") or None,
        last_start.get("channel") or None,
        last_start.get("content_id") or None,
    )


# ==========================================
# СТАТИСТИКА
# ==========================================

def get_stats():
    
    if not os.path.exists(CSV_FILE):
        return {
            "users": 0,
            "starts": 0,
            "payment_clicks": 0,
            "unique_payers": 0,
            "conversion": 0.0,
        }

    users = set()
    start_users = set()
    payment_users = set()

    starts = 0
    payment_clicks = 0

    try:
        with open(
            CSV_FILE,
            "r",
            newline="",
            encoding="utf-8",
        ) as file:

            reader = csv.DictReader(file)

            for row in reader:
                if (row.get("content_id") or "").startswith("test_"):
                    continue
                user_id = row.get("user_id")
                event = row.get("event")

                if not user_id:
                    continue

                if event == "start":
                    starts += 1
                    users.add(user_id)
                    start_users.add(user_id)

                elif event == "payment_click":
                    payment_clicks += 1
                    payment_users.add(user_id)
                    users.add(user_id)

    except Exception as error:
        print(f"Ошибка чтения статистики: {error}")

    conversion = (
        len(payment_users) / len(start_users) * 100
        if start_users
        else 0
    )

    return {
        "users": len(users),
        "starts": starts,
        "payment_clicks": payment_clicks,
        "unique_payers": len(payment_users),
        "conversion": conversion,
    }


# ==========================================
# START С TRACKING LINK
# ==========================================

@dp.message(CommandStart(deep_link=True))
async def start_with_source(
    message: Message,
    command: CommandObject,
):
    encoded_source = command.args

    if not encoded_source:
        await start_without_source(message)
        return

    source_code = decode_source(encoded_source)

    if source_code is None:
        await message.answer(
            "Не удалось определить источник перехода."
        )
        return

    social_network, channel, content_id = parse_source(
        source_code
    )

    if not social_network:
        await message.answer(
            "Некорректный tracking-код."
        )
        return

    save_event(
        user_id=message.from_user.id,
        username=message.from_user.username,
        event="start",
        source_code=source_code,
        social_network=social_network,
        channel=channel,
        content_id=content_id,
    )

    await message.answer(
        "Привет! 👋\n\n"
        "Вы перешли из публикации Поступашек.\n"
        "Здесь можно перейти к покупке курса и связаться с менеджером.\n\n"
        "Нажмите кнопку ниже.",
        reply_markup=keyboard_for_source(source_code)
    )


# ==========================================
# START БЕЗ TRACKING LINK
# ==========================================

@dp.message(CommandStart())
async def start_without_source(message: Message):
    save_event(
        user_id=message.from_user.id,
        username=message.from_user.username,
        event="start",
        source_code=None,
        social_network=None,
        channel=None,
        content_id=None,
    )

    await message.answer(
        "Привет! 👋\n\n"
        "Вы перешли из публикации Поступашек.\n"
        "Здесь можно перейти к покупке курса и связаться с менеджером.\n\n"
        "Нажмите кнопку ниже.",
        reply_markup=keyboard_for_source(None)
    )


# ==========================================
# ГЛАВНОЕ МЕНЮ
# ==========================================

@dp.callback_query(lambda callback: callback.data == "main_menu")
async def main_menu_handler(callback: CallbackQuery):
    await callback.answer()

    await callback.message.answer(
        "🏠 Главное меню\n\n"
        "Выберите нужный раздел:",
        reply_markup=main_keyboard
    )


# ==========================================
# О КОМАНДЕ
# ==========================================

@dp.callback_query(lambda callback: callback.data == "team")
async def team_handler(callback: CallbackQuery):
    await callback.answer()

    await callback.message.answer(
        "📋 <b>О команде</b>\n\n"
        "Мы — команда «Наступашки» из 5 человек, которая разрабатывает "
        "решение для аналитики и атрибуции переходов из Telegram.\n\n"
        
        "Наша цель — сделать путь пользователя от источника "
        "до целевого действия прозрачным и измеримым.",
        reply_markup=back_keyboard,
        parse_mode="HTML",
    )


# ==========================================
# FAQ
# ==========================================

@dp.callback_query(lambda callback: callback.data == "faq")
async def faq_handler(callback: CallbackQuery):
    await callback.answer()

    await callback.message.answer(
        "❓ <b>Актуальные вопросы</b>\n\n"
        "1. Как проходит оплата?\n"
        "Оплата происходит через менеджера.\n\n"
        "2. Когда я получу доступ?\n"
        "Уточнить условия и получение доступа можно у менеджера.\n\n"
        "3. Как связаться с менеджером?\n"
        "Нажмите кнопку «Перейти к покупке».",
        reply_markup=back_keyboard,
        parse_mode="HTML",
    )


# ==========================================
# ОПЛАТА
# ==========================================

@dp.callback_query(lambda callback: callback.data == "payment" or (callback.data or "").startswith("payment:"))
async def payment_handler(callback: CallbackQuery):
    await callback.answer()

    source_code, social_network, channel, content_id = (
        get_current_source(callback.from_user.id, (callback.data or "").partition(":")[2])
    )

    # Фиксируем только сам клик по кнопке оплаты
    save_event(
        user_id=callback.from_user.id,
        username=callback.from_user.username,
        event="payment_click",
        source_code=source_code,
        social_network=social_network,
        channel=channel,
        content_id=content_id,
    )

    payment_keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="💳 Написать менеджеру",
                    url=PAYMENT_URL
                )
            ],
            [
                InlineKeyboardButton(
                    text="⬅️ Главное меню",
                    callback_data="main_menu"
                )
            ],
        ]
    )

    await callback.message.answer(
        "Готово — передаём вас менеджеру 👌\n\n"
        "Для оформления заказа напишите нашему менеджеру "
        "в Telegram.",
        reply_markup=payment_keyboard,
        parse_mode="HTML",
    )


# ==========================================
# ADMIN /stats
# ==========================================

@dp.message(Command("stats"))
async def stats_handler(message: Message):
    # Проверяем, что команду вызвал именно администратор
    if message.from_user.id != ADMIN_ID:
        await message.answer("⛔ Команда недоступна.")
        return

    stats = get_stats()

    await message.answer(
        "📊 <b>Статистика бота</b>\n\n"
        f"👤 Уникальных пользователей: <b>{stats['users']}</b>\n"
        f"🚀 Start: <b>{stats['starts']}</b>\n"
        f"💳 Payment clicks: <b>{stats['payment_clicks']}</b>\n"
        f"👥 Уникальных пользователей с payment click: "
        f"<b>{stats['unique_payers']}</b>\n\n"
        f"📈 Конверсия start → payment click: "
        f"<b>{stats['conversion']:.1f}%</b>",
        parse_mode="HTML",
    )


# ==========================================
# MAIN
# ==========================================

async def main():
    info = await bot.get_webhook_info()
    if info.url:
        raise RuntimeError("Для polling нужно отключить активный webhook. Проверьте pnpm bot:check. Автоматически webhook не удаляется.")
    me = await bot.get_me()
    if me.username.lower() != BOT_USERNAME.lower():
        raise RuntimeError("Токен относится к другому боту: проверьте TELEGRAM_BOT_USERNAME.")
    print(f"Bot started: @{me.username} (local polling)", flush=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
