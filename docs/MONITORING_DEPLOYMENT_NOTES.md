# Ghi Chú Triển Khai Monitoring Stack

Tài liệu này ghi lại quá trình tăng cường monitoring/alerting cho crypto-trading stack, để có thể tái tạo setup trên server mới với ít lỗi sai hơn.

## Phạm vi

Stack được cover:
- Prometheus
- Alertmanager
- Node Exporter
- Grafana
- Gửi cảnh báo qua Telegram

Các file chính đã thay đổi:
- `docker-compose.monitoring.yml`
- `prometheus/alerts.yml`
- `alertmanager/alertmanager.yml`
- `ansible/roles/monitoring/templates/alerts.yml.j2`
- `ansible/roles/monitoring/templates/alertmanager.yml.j2`
- `alertmanager/telegram-bridge.py`
- `alertmanager/host-tcp-forward.py`
- `alertmanager/Dockerfile.telegram-bridge`

## Những gì đã được tăng cường

### 1) Alertmanager routing đã được tinh chỉnh để giảm noise

File:
- `alertmanager/alertmanager.yml`
- `ansible/roles/monitoring/templates/alertmanager.yml.j2`

Thay đổi đã áp dụng:
- Giữ `critical` alerts lặp mỗi `1h`
- Giữ `warning` alerts lặp mỗi `12h`
- Tăng `group_interval` top-level từ `10s` lên `30s` để batch các alerts liên quan tốt hơn
- Thêm route `DeadMansSwitch` riêng trước các severity routes
- Thêm receiver path riêng cho deadman và các alerts khác

Lý do:
- Tránh burst noise từ các alerts liên quan
- Ngăn deadman alert bị trộn vào stream critical bình thường
- Giữ incidents quan trọng trên production diễn ra nhanh trong khi warning alerts giữ nhẹ nhàng hơn

### 2) Cảnh báo high error rate đã được bảo vệ chống false positives ở low-traffic

File:
- `prometheus/alerts.yml`
- `ansible/roles/monitoring/templates/alerts.yml.j2`

Thay đổi đã áp dụng:
- Đổi biểu thức `HighErrorRate` yêu cầu cả hai:
  - error ratio > 5%
  - request volume > 1 req/s trong cùng 5 phút window

### 3) Cảnh báo disk space đã được làm an toàn hơn cho containerized hosts

File:
- `prometheus/alerts.yml`
- `ansible/roles/monitoring/templates/alerts.yml.j2`

Thay đổi đã áp dụng:
- Siết `DiskSpaceLow` expression để loại trừ các filesystem tạm thời/container

### 4) DeadMansSwitch severity và delivery đã được điều chỉnh

File:
- `prometheus/alerts.yml`
- `ansible/roles/monitoring/templates/alerts.yml.j2`
- `alertmanager/alertmanager.yml`
- `ansible/roles/monitoring/templates/alertmanager.yml.j2`

Thay đổi đã áp dụng:
- Đổi `DeadMansSwitch` severity từ `warning` sang `critical`
- Route qua bridge path
- Giữ delivery path riêng để deadman giữ visual distinct

### 5) Đã fix Node Exporter healthcheck

File:
- `docker-compose.monitoring.yml`

Thay đổi đã áp dụng:
- Đổi Node Exporter healthcheck endpoint từ `/health` sang `/metrics`

## Validation đã thực hiện trước khi deploy

### Kiểm tra parse YAML
```bash
python3 - <<'PY'
import yaml
for p in ['prometheus/alerts.yml', 'alertmanager/alertmanager.yml']:
    with open(p) as f:
        yaml.safe_load(f)
    print('YAML_OK', p)
PY
```

Kết quả quan sát được:
- `YAML_OK prometheus/alerts.yml`
- `YAML_OK alertmanager/alertmanager.yml`

### Docker Compose config validation
```bash
TELEGRAM_BOT_TOKEN=*** GF_SECURITY_ADMIN_PASSWORD=*** docker compose -f docker-compose.monitoring.yml config
```

Kết quả quan sát được:
- Compose validation passed
- Docker chỉ emit warning rằng field `version` đã obsolete

## Xác minh deployment thực tế và runtime đã thực hiện

### 1) Đưa monitoring stack lên

Lệnh đã dùng:
```bash
docker compose --env-file .env.production -f docker-compose.monitoring.yml up -d
```

### 2) Tìm và fix Alertmanager crash-loop từ unsupported env expansion

Root cause đã xác nhận từ logs:
```text
alertmanager: error: unknown long flag '--config.expand-env', try --help
```

Compatibility check xác nhận `prom/alertmanager:v0.27.0` không hỗ trợ `--config.expand-env`.

Fix đã áp dụng:
- Loại bỏ `--config.expand-env`
- Không còn dựa vào direct env expansion bên trong Alertmanager config cho runtime này

### 3) Đã xác minh container health sau fix

Các thành phần healthy:
- `prometheus`
- `grafana`
- `node_exporter`
- `alertmanager` (khi chạy qua Compose path trước host-network workaround)

Các endpoint checks đã pass:
```bash
curl -fsS http://127.0.0.1:9093/-/healthy
curl -fsS http://127.0.0.1:9090/-/healthy
curl -fsS http://127.0.0.1:9100/metrics >/dev/null
curl -fsS http://127.0.0.1:3001/api/health
```

### 4) Đã xác minh Prometheus rule state tại runtime

Kiểm tra qua Prometheus API sau reload:
- `BackendDown` -> `inactive`, `health=ok`
- `HighErrorRate` -> `inactive`, `health=ok`
- `DiskSpaceLow` -> `inactive`, `health=ok`
- `DeadMansSwitch` -> `firing`, `health=ok`

Tập alert active đã quan sát:
- `DeadMansSwitch firing critical`

### 5) Đã điều tra sâu về lỗi built-in Telegram notifier

Các lỗi đã quan sát:
- Alertmanager built-in Telegram notifier không verify được TLS tới `api.telegram.org`
- Node-based bridge bên trong container lỗi với `self-signed certificate`
- Alpine runtime package fetch cũng không verify được TLS trust
- container-to-host reachability không đáng tin cậy đủ để break một simple host-bridge path từ Compose Alertmanager container

Kết luận thực tế:
- Runtime/container environment có trust/network inconsistencies
- Fix workaround sạch nhất trên máy này là chuyển Alertmanager sang host-network runtime path và dùng host-side Telegram webhook bridge

## Final working workaround đã sử dụng

### Host-side Telegram bridge

Bridge file:
- `alertmanager/telegram-bridge.py`

Runtime behavior:
- Listen trên host port `9095`
- Accept Alertmanager webhook payloads tại `/alert`
- Gửi Telegram messages qua host `curl`

Phát hiện quan trọng:
- `.env.production` **không** chứa real Telegram token tại thời điểm verify; nó giữ `***`
- Telegram end-to-end chỉ thành công sau khi restart host bridge với real token được cung cấp trong quá trình debug

### Host-side Alertmanager

Thay vì dựa vào containerized Alertmanager-to-host bridge path, Alertmanager chạy trực tiếp với host networking:
```bash
docker run --rm --name alertmanager-host \
  --network host \
  -v /home/ubuntu/crypto-trading/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro \
  -v /home/ubuntu/crypto-trading/alertmanager/telegram.tmpl:/etc/alertmanager/telegram.tmpl:ro \
  -v alertmanager_data:/alertmanager \
  prom/alertmanager:v0.27.0 \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.external-url=http://127.0.0.1:9093 \
  --web.route-prefix=/
```

Alertmanager host-network này đã load config thành công và serve health checks.

## Bằng chứng end-to-end

### Direct bridge Telegram send đã verify
Log quan sát được:
```text
telegram_send_ok {"ok":true,...}
```

### Full firing path đã verify
Path đã verify:
- Alertmanager (host-network)
- webhook to host bridge
- host bridge gửi Telegram

Log quan sát được:
```text
webhook_received {"status": "firing", ... "alertname": "AMHostNetFinal..."}
telegram_send_ok {"ok":true,...}
```

Điều này xác nhận real Telegram delivery cho firing alert path.

### Resolved path
Một resolved alert payload cũng đã được inject trong testing, nhưng captured evidence trong final log excerpt chỉ show firing delivery. Vậy firing path đã verify với bằng chứng cứng; resolved delivery đã attempt nhưng không claim proven trong final captured log snippet.

## Những gì vẫn chưa hoàn hảo / operational caveats

1. Current proven working path trên host này là **host-side Alertmanager + host-side bridge**, không phải pure Compose-to-Compose Telegram delivery.
2. `.env.production` nên được sửa để chứa real Telegram bot token nếu muốn reproducible mà không cần manual runtime injection.
3. Các Compose bridge experiments trong repo nên được coi là intermediate/debugging artifacts cho đến khi Docker/container trust environment được dọn dẹp.
4. `version` trong Compose vẫn obsolete và có thể remove.

## Các bước tăng cường tiếp theo được khuyến nghị

1. **Persist host-side Alertmanager và host-side bridge cleanly**
   - systemd units hoặc another supervised host service model
   - Không dựa vào ad-hoc `nohup` trên production

2. **Sửa `.env.production`**
   - Replace placeholder `***` bằng real bot token trong intended secure deployment path

3. **Dọn dẹp Compose bridge experiments**
   - Hoặc remove hoặc finish stable Docker-native bridge sau khi container trust/network issues được resolve

4. **Investigate Docker/container trust path riêng**
   - Container TLS trust tới Telegram và package repositories không nhất quán trên máy này
   - Đây là host/runtime issue đáng fix độc lập với monitoring config

## Tóm tắt nhanh

Pass này hoàn thành real deployment và runtime verification, không chỉ repo edits:
- Monitoring config hardening đã apply
- Alertmanager incompatibility với `--config.expand-env` đã identified và corrected
- Runtime rules đã verify
- Built-in Telegram notifier failure đã isolated tới runtime TLS/trust behavior
- Host-side Telegram bridge đã implement
- Host-network Alertmanager path đã dùng như pragmatic workaround
- Real Telegram firing alert delivery đã verify end-to-end

## Persistent setup đã hoàn thành (systemd)

Để alerting survive reboots và tránh ad-hoc nohup runs, hai host-level systemd services đã được install và enable.

### Service 1: Telegram bridge

Unit file path:
- `/etc/systemd/system/crypto-telegram-bridge.service`

Unit content:
```ini
[Unit]
Description=Crypto Telegram Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/crypto-trading
ExecStart=/home/ubuntu/crypto-trading/alertmanager/run-telegram-bridge.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Exec script:
- `alertmanager/run-telegram-bridge.sh`
- Đọc `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` từ `.env.production`
- Start `python3 alertmanager/telegram-bridge.py`

### Service 2: Host-network Alertmanager

Unit file path:
- `/etc/systemd/system/crypto-alertmanager-host.service`

Unit content:
```ini
[Unit]
Description=Crypto Alertmanager Host
After=network-online.target docker.service crypto-telegram-bridge.service
Wants=network-online.target
Requires=docker.service
After=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/crypto-trading
ExecStart=/home/ubuntu/crypto-trading/alertmanager/run-alertmanager-host.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Exec script:
- `alertmanager/run-alertmanager-host.sh`
- Chạy `prom/alertmanager:v0.27.0` với `--network host`
- Mounts:
  - `alertmanager/alertmanager.yml`
  - `alertmanager/telegram.tmpl`
  - `alertmanager_data` Docker volume

### Các bước activation đã dùng

```bash
sudo chmod +x /home/ubuntu/crypto-trading/alertmanager/run-telegram-bridge.sh
sudo chmod +x /home/ubuntu/crypto-trading/alertmanager/run-alertmanager-host.sh
sudo systemctl daemon-reload
sudo systemctl enable --now crypto-telegram-bridge.service
sudo systemctl enable --now crypto-alertmanager-host.service
```

### Đã verify runtime state

Tại deployment completion cả hai services đều:
- `enabled`
- `active (running)`

Các lệnh verify nhanh:
```bash
sudo systemctl is-enabled crypto-telegram-bridge.service crypto-alertmanager-host.service
sudo systemctl is-active crypto-telegram-bridge.service crypto-alertmanager-host.service
sudo systemctl status --no-pager crypto-telegram-bridge.service crypto-alertmanager-host.service
```

## Monitoring compose ownership sau hardening

`docker-compose.monitoring.yml` hiện có chủ đích loại trừ experimental Alertmanager/bridge containers.

Các Compose-managed monitoring services hiện tại:
- `prometheus`
- `grafana`
- `node-exporter`

Host-managed (systemd + host runtime):
- Alertmanager (`crypto-alertmanager-host.service`)
- Telegram bridge (`crypto-telegram-bridge.service`)

Split này có chủ đích để reliability trên host này cho đến khi container TLS/trust behavior được fix.

## Production environment requirements

Required keys trong `/home/ubuntu/crypto-trading/.env.production`:
- `TELEGRAM_BOT_TOKEN` (real production bot token)
- `TELEGRAM_CHAT_ID`
- `GF_SECURITY_ADMIN_PASSWORD`

Notes:
- Không commit real tokens/passwords vào Git.
- Nếu Telegram delivery silently fail sau reboot, trước tiên confirm token/chat id có present và non-placeholder values.

## Fast rebuild checklist (new server / disaster recovery)

1. Clone repo tới `/home/ubuntu/crypto-trading`
2. Chuẩn bị `.env.production` với real secrets
3. Start Compose monitoring baseline:
   ```bash
   docker compose --env-file .env.production -f docker-compose.monitoring.yml up -d
   ```
4. Ensure scripts executable:
   ```bash
   chmod +x alertmanager/run-telegram-bridge.sh alertmanager/run-alertmanager-host.sh
   ```
5. Install hai systemd unit files từ tài liệu này
6. Enable/start services:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now crypto-telegram-bridge.service
   sudo systemctl enable --now crypto-alertmanager-host.service
   ```
7. Verify health:
   ```bash
   curl -fsS http://127.0.0.1:9093/-/healthy
   curl -fsS http://127.0.0.1:9090/-/healthy
   curl -fsS http://127.0.0.1:9100/metrics >/dev/null
   curl -fsS http://127.0.0.1:3001/api/health
   ```
8. Gửi một test alert và confirm Telegram receive path end-to-end

## Known limitations (track for future cleanup)

- Alertmanager không chạy như Compose service trong final setup.
- Host-network mode được dùng như pragmatic workaround.
- Duplicate `After=` lines trong `crypto-alertmanager-host.service` harmless nhưng có thể tidy later.
- Docker/container TLS trust path tới Telegram/package repos vẫn deserves root-cause fix.
