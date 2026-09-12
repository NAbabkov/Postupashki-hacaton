"""Read-only Telegram diagnostic. Never consumes updates or sends messages."""
import os,json,ssl,urllib.request,urllib.error
from pathlib import Path
path=Path(__file__).resolve().parents[1]/"bot/.env"
if path.exists():
 for line in path.read_text().splitlines():
  if "=" in line and not line.lstrip().startswith("#"):
   key,value=line.split("=",1);os.environ.setdefault(key.strip(),value.strip().strip('"').strip("'"))
token=os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("BOT_TOKEN")
if not token:
 print("NOT CONFIGURED: добавьте TELEGRAM_BOT_TOKEN в bot/.env. Команда запуска: pnpm bot:start")
 raise SystemExit(2)
try:
 import certifi
 context=ssl.create_default_context(cafile=certifi.where())
except ImportError:
 context=ssl.create_default_context()
def call(method):
 try:
  with urllib.request.urlopen("https://api.telegram.org/bot"+token+"/"+method,timeout=15,context=context) as r:data=json.load(r)
 except urllib.error.HTTPError as e:
  print("Telegram API HTTP",e.code,"(значение токена скрыто)");raise SystemExit(1)
 except Exception:
  print("Telegram API недоступен: проверьте сеть.");raise SystemExit(1)
 if not data.get("ok"):print("Telegram API: запрос отклонён");raise SystemExit(1)
 return data["result"]
me=call("getMe");info=call("getWebhookInfo")
print("Bot:","@"+me["username"])
print("Webhook URL:",info.get("url") or "нет, используйте local polling")
print("Pending updates:",info.get("pending_update_count",0))
print("Last error:",info.get("last_error_message") or "нет")
print("STATUS:","WEBHOOK ACTIVE (polling запускать нельзя)" if info.get("url") else "TOKEN OK, нужен постоянно работающий pnpm bot:start")
