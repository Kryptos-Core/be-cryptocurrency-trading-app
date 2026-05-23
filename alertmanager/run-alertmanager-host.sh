#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/crypto-trading
exec docker run --rm --name alertmanager-host \
  --network host \
  -v /home/ubuntu/crypto-trading/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro \
  -v /home/ubuntu/crypto-trading/alertmanager/telegram.tmpl:/etc/alertmanager/telegram.tmpl:ro \
  -v alertmanager_data:/alertmanager \
  prom/alertmanager:v0.27.0 \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.external-url=http://127.0.0.1:9093 \
  --web.route-prefix=/
