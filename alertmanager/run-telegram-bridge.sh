#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/crypto-trading
export TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env.prod | cut -d= -f2-)
export TELEGRAM_CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' .env.prod | cut -d= -f2-)
exec python3 /home/ubuntu/crypto-trading/alertmanager/telegram-bridge.py
