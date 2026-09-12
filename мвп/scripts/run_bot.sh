#!/usr/bin/env bash
set -euo pipefail
bot_dir="$(cd "$(dirname "$0")/../bot" && pwd)"
python_cmd="${BOT_PYTHON:-python3}"
"$python_cmd" -c 'import sys; assert sys.version_info >= (3,10), "Нужен Python 3.10+ (задайте BOT_PYTHON)"'
if ! "$python_cmd" - "$bot_dir/.env" <<'CHECK'
import os,sys
from pathlib import Path
values={}
file=Path(sys.argv[1])
if file.exists():
    for line in file.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key,value=line.split('=',1); values[key.strip()]=value.strip().strip('"').strip("'")
token=os.getenv('TELEGRAM_BOT_TOKEN') or os.getenv('BOT_TOKEN') or values.get('TELEGRAM_BOT_TOKEN') or values.get('BOT_TOKEN')
sys.exit(0 if token else 2)
CHECK
then
  echo 'Добавьте TELEGRAM_BOT_TOKEN в мвп/bot/.env (пример: bot/.env.example).'
  exit 2
fi
if [[ ! -x "$bot_dir/.venv/bin/python" ]]; then
  "$python_cmd" -m venv "$bot_dir/.venv"
  "$bot_dir/.venv/bin/python" -m pip install -r "$bot_dir/requirements.txt"
fi
cd "$bot_dir"
exec "$bot_dir/.venv/bin/python" bot.py
