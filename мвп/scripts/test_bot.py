"""Offline tests of the original aiogram handlers, without Telegram requests."""
import asyncio,os,tempfile,csv,importlib.util,hashlib
from pathlib import Path
os.environ["TELEGRAM_BOT_TOKEN"]="123456789:"+"a"*35
path=Path(__file__).resolve().parents[1]/"bot/bot.py"
spec=importlib.util.spec_from_file_location("team_bot",path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class User:
 id=12345;username="fictional_qa"
class Message:
 from_user=User()
 def __init__(self):self.answers=[]
 async def answer(self,text,**kwargs):self.answers.append((text,kwargs))
class Command:
 def __init__(self,args):self.args=args
class Callback:
 from_user=User()
 def __init__(self,source):self.data="payment:"+module.source_fingerprint(source);self.message=Message()
 async def answer(self):pass
async def run():
 with tempfile.TemporaryDirectory() as directory:
  module.CSV_FILE=str(Path(directory)/"events.csv")
  a="telegram|channel_one|abc1234567";b="telegram|channel_two|xyz1234567"
  assert module.decode_source(module.encode_source(a))==a
  assert module.decode_source("!!!") in (None,"")
  message=Message();await module.start_with_source(message,Command(module.encode_source(a)))
  assert message.answers and message.answers[0][1]["reply_markup"].inline_keyboard[0][0].text=="Перейти к покупке"
  await module.start_with_source(Message(),Command(module.encode_source(b)))
  callback=Callback(a);await module.payment_handler(callback)
  rows=list(csv.DictReader(open(module.CSV_FILE,encoding="utf-8")))
  assert rows[-1]["event"]=="payment_click" and rows[-1]["source_code"]==a
  assert rows[-1]["timestamp"].endswith("Z") and rows[-1]["username"]!="fictional_qa"
  assert callback.message.answers[0][1]["reply_markup"].inline_keyboard[0][0].url=="https://t.me/menshe_treh"
  unknown=Message();await module.start_without_source(unknown)
  await module.payment_handler(Callback(None));rows=list(csv.DictReader(open(module.CSV_FILE,encoding="utf-8")))
  assert rows[-1]["source_code"]==""
  bad=Message();await module.start_with_source(bad,Command("!!!"));assert bad.answers
  before=module.get_stats();await module.start_with_source(Message(),Command(module.encode_source("telegram|preview|test_abc1234567")));assert module.get_stats()==before
  print("PASS: decode, Start reply/button, source-owned callback, UTC/hash, manager destination, unknown source, malformed payload reply, preview exclusion (8 checks, no Telegram calls)")
asyncio.run(run())
