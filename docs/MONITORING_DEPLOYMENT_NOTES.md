# Ghi Chú Triển Khai Monitoring Stack

Tài liệu này ghi lại quá trình tăng cường monitoring/alerting cho crypto-trading stack, để có thể tái tạo setup trên server mới với ít lỗi sai hơn.

## Final state đã được xác nhận trên VPS này

### 1) Docker networking / exposure posture

- `BIND_HOST=127.0.0.1` trong `.env.production`
- `KAFKA_EXTERNAL_BIND_HOST=0.0.0.0` trong `.env.production`
- Kết quả runtime mong muốn:
  - PostgreSQL → `127.0.0.1:5432`
  - Redis → `127.0.0.1:6379`
  - TimescaleDB → `127.0.0.1:5433`
  - ClickHouse HTTP → `127.0.0.1:8123`
  - ClickHouse TCP → `127.0.0.1:9000`
  - Kafka internal listener → `127.0.0.1:9092`
  - Kafka external listener → `0.0.0.0:29092`
  - Prometheus → `127.0.0.1:9090`
  - Alertmanager → `127.0.0.1:9093`
  - Grafana → `127.0.0.1:3001`
  - Node Exporter → `127.0.0.1:9100`

Lý do:
- giảm bề mặt tấn công khi di dời server
- chỉ Kafka external port `29092` là public theo nhu cầu vận hành
- các DB/service nội bộ vẫn reachable từ host hoặc từ các container nội bộ, nhưng không public ra Internet

### 2) Monitoring stack final state

Compose path đã được xác nhận hoạt động:
- `prometheus`
- `alertmanager`
- `grafana`
- `node_exporter`
- `telegram_bridge`

Khác với một số note thử nghiệm trước đó, **final working path trên VPS này là Docker Compose-native**, không cần host-side Alertmanager workaround nữa.

### 3) Prometheus default scrape policy

Để tránh dashboard đỏ giả trên server mới, default `prometheus/prometheus.yml` chỉ scrape các service baseline luôn chạy:
- `prometheus`
- `alertmanager`
- `node-exporter`
- `crypto_backend`
- `crypto_market_aggregator`

Không scrape mặc định:
- `crypto_matching_engine`
- `crypto_public_ws_gateway`

Lý do:
- hai service này là optional/profile-based
- nếu chưa enable mà vẫn scrape, Prometheus sẽ show `down`/`no such host`
- điều đó gây nhầm lẫn sau migration dù production baseline vẫn khỏe

Khi nào cần bật lại scrape cho optional services:
- chỉ khi đã enable đúng Docker profile/service trên server đích
- dùng đúng Docker-reachable names:
  - `crypto_matching_engine:8081`
  - `crypto_public_ws_gateway:8082`

### 4) Migration requirement trước khi backend healthy

Backend production trên server mới **không nên được coi là lỗi app** nếu vừa boot xong mà health chưa xanh ngay.

Trên VPS này đã xác nhận root cause thật là thiếu database schema, với lỗi runtime như:
- `relation "integration_outbox" does not exist`
- `relation "system_configs" does not exist`

Final recovery sequence đã được xác minh:

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production run --rm app npm run db:migrate:prod
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d app
```

Sau migration, backend đã lên healthy thành công.

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
- `prometheus/prometheus.yml`
- `alertmanager/alertmanager.yml`
- `alertmanager/telegram-bridge.js`
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
- `repeat_interval` hiện là `5m` cho top-level route
- `repeat_interval` hiện là `5m` cho route `critical`
- `repeat_interval` hiện là `5m` cho route `DeadMansSwitch`
- `warning` không khai báo `repeat_interval` riêng nên kế thừa top-level `5m`
- Tăng `group_interval` top-level từ `10s` lên `30s` để batch các alerts liên quan tốt hơn
- Thêm route `DeadMansSwitch` riêng trước các severity routes
- Thêm receiver path riêng cho deadman và các alerts khác

Lý do:
- Tránh burst noise từ các alerts liên quan
- Ngăn deadman alert bị trộn vào stream critical bình thường
- Nhắc lại các incidents đang firing sau mỗi 5 phút để không bị bỏ sót trong vận hành

Checklist tránh setup sai:
- Khi đổi interval, sửa đồng thời cả `alertmanager/alertmanager.yml` và `ansible/roles/monitoring/templates/alertmanager.yml.j2`
- Sau khi deploy, reload/recreate Alertmanager để config mới có hiệu lực; chỉ sửa file trên disk là chưa đủ
- Kiểm tra lại trong Alertmanager UI hoặc API rằng active route đang dùng `repeat_interval: 5m`

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

### 5) Nội dung Telegram alert đã được làm chi tiết hơn

File:
- `prometheus/alerts.yml`
- `ansible/roles/monitoring/templates/alerts.yml.j2`
- `alertmanager/telegram-bridge.js`

Thay đổi đã áp dụng:
- Prometheus alert annotations có thêm `impact` và `action` cho backend/server/container/database/Redis/disk/load/heartbeat
- Alert summary/description có thêm context như `job`, `instance`, `mountpoint`, `device` nếu Prometheus có label tương ứng
- Telegram bridge hiển thị thêm `Impact`, `Action`, `Value`, `Runbook`, `Dashboard`, `Started`, `Ended`, `Source`, `Group labels`
- `ansible/roles/monitoring/templates/alerts.yml.j2` bọc `{% raw %}` / `{% endraw %}` để Ansible không parse nhầm Prometheus template variables dạng `{{ $labels.instance }}`

Lý do:
- Người nhận Telegram biết ngay alert ảnh hưởng gì và nên kiểm tra gì trước
- Tránh setup thiếu annotation khiến Telegram chỉ có tên alert nhưng không đủ thông tin xử lý
- Tránh lỗi render Ansible khi Prometheus alert rule dùng Go-template variables

Checklist tránh setup thiếu:
- Khi thêm alert mới, luôn có tối thiểu `summary`, `description`, `impact`, `action`
- Nếu alert cần link vận hành, thêm `runbook_url` hoặc `dashboard_url`; bridge sẽ tự render nếu có
- Nếu sửa `prometheus/alerts.yml`, cập nhật rule tương ứng trong `ansible/roles/monitoring/templates/alerts.yml.j2`
- Nếu sửa template Ansible có `{{ $labels... }}`, giữ block `{% raw %}` để không bị Jinja render lỗi

### 6) Đã fix Node Exporter healthcheck

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

### Historical debugging note: host-side Alertmanager experiment

Trong một nhánh debug tạm thời, team từng thử chạy Alertmanager bằng host networking để cô lập vấn đề Telegram/TLS. Ví dụ thử nghiệm khi đó:
```bash
docker run --rm --name alertmanager-host \
  --network host \
  -v /home/ubuntu/be-cryptocurrency-trading-app/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro \
  -v /home/ubuntu/be-cryptocurrency-trading-app/alertmanager/telegram.tmpl:/etc/alertmanager/telegram.tmpl:ro \
  -v alertmanager_data:/alertmanager \
  prom/alertmanager:v0.27.0 \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.external-url=http://127.0.0.1:9093 \
  --web.route-prefix=/
```

**Lưu ý:** đây chỉ là evidence/debug path lịch sử. Final intended state cho VPS này và cho lần migrate sau vẫn là **Compose-native monitoring stack** (`prometheus`, `alertmanager`, `grafana`, `node_exporter`, `telegram_bridge`).

## Bằng chứng end-to-end

### Direct bridge Telegram send đã verify
Log quan sát được:
```text
telegram_send_ok {"ok":true,...}
```

### Full firing path đã verify
Path đã verify:
- Alertmanager
- webhook to Telegram bridge
- Telegram bridge gửi Telegram

Log quan sát được:
```text
webhook_received {"status": "firing", ... "alertname": "AMHostNetFinal..."}
telegram_send_ok {"ok":true,...}
```

Điều này xác nhận real Telegram delivery cho firing alert path.

### Resolved path
Một resolved alert payload cũng đã được inject trong testing, nhưng captured evidence trong final log excerpt chỉ show firing delivery. Vậy firing path đã verify với bằng chứng cứng; resolved delivery đã attempt nhưng không claim proven trong final captured log snippet.

## Những gì vẫn chưa hoàn hảo / operational caveats

1. Telegram delivery vẫn phụ thuộc vào việc `.env.production` chứa đúng `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`.
2. Khi thay đổi `BIND_HOST` hoặc các port mapping của container đã tồn tại, cần **recreate** service thì bind mới mới có hiệu lực; chỉ `restart` là chưa đủ.
3. Các optional services (`matching-engine`, `public-ws-gateway`) không nên được scrape mặc định nếu chưa enable profile tương ứng.
4. Warning phụ như thiếu Firebase credentials hoặc `TRON_GRID_API_KEY` không làm backend chết, nhưng vẫn nên được xử lý khi bật các tính năng liên quan.

## Các bước tăng cường tiếp theo được khuyến nghị

1. **Giữ monitoring theo Docker Compose-native path**
   - Dùng `docker-compose.monitoring.yml` làm source of truth
   - Tránh quay lại workaround host-side nếu stack hiện tại vẫn healthy

2. **Chuẩn hóa quy trình recreate khi harden port exposure**
   - Sau khi đổi `BIND_HOST` hoặc port binding trong `.env.production`, chạy recreate cho các service bị ảnh hưởng
   - Ví dụ với TimescaleDB và ClickHouse:
   ```bash
   cd /home/ubuntu/be-cryptocurrency-trading-app
   sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate timescaledb clickhouse
   ```

3. **Giữ docs deployment và monitoring đồng bộ với trạng thái final**
   - Monitoring dùng Compose-native
   - Alertmanager/Telegram bridge là containerized services trong monitoring stack

4. **Investigate Docker/container trust path riêng nếu lỗi Telegram quay lại**
   - Chỉ cần nếu sau này runtime/container TLS trust tới Telegram hoặc package repos lại có vấn đề

## Tóm tắt nhanh

Pass này hoàn thành cả repo edits lẫn hardening/runtime verification cần thiết cho lần migrate sau:
- Monitoring compose warning `version` đã được dọn
- Default Prometheus scrape targets đã chỉ giữ baseline services luôn chạy
- Kafka exposure giữ đúng split: local `9092`, public `29092`
- ClickHouse và TimescaleDB đã được cấu hình loopback-only qua `BIND_HOST=127.0.0.1`
- Tài liệu đã ghi lại migration requirement trước khi backend healthy
- Tài liệu cũng ghi rõ việc phải recreate container sau khi đổi port binding / bind host

## Monitoring compose ownership sau hardening

Các Compose-managed monitoring services hiện tại:
- `prometheus`
- `alertmanager`
- `grafana`
- `node_exporter`
- `telegram_bridge`

Đây là final intended state để mang sang VPS mới.

## Production environment requirements

Required keys trong `/home/ubuntu/be-cryptocurrency-trading-app/.env.production`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `GF_SECURITY_ADMIN_PASSWORD`
- các database/app secrets production khác theo `.env.production.example`

Notes:
- Không commit real tokens/passwords vào Git.
- Nếu Telegram delivery fail sau migration, trước tiên confirm token/chat id có present và non-placeholder values.

## Fast rebuild checklist (new server / disaster recovery)

1. Clone repo tới thư mục đích, ví dụ `/home/ubuntu/be-cryptocurrency-trading-app`
2. Chuẩn bị `.env.production` với real secrets
3. Start production stack baseline:
   ```bash
   cd /home/ubuntu/be-cryptocurrency-trading-app
   sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```
4. Chạy migrations trước khi đánh giá backend health:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml --env-file .env.production run --rm app npm run db:migrate:prod
   sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d app
   ```
5. Start monitoring stack:
   ```bash
   sudo docker-compose -f docker-compose.monitoring.yml --env-file .env.production up -d --build
   ```
6. Nếu vừa đổi `BIND_HOST`/port binding cho services dữ liệu, recreate các service đó để bind mới có hiệu lực:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate timescaledb clickhouse
   ```
7. Verify health:
   ```bash
   curl -fsS http://127.0.0.1:9090/-/healthy
   curl -fsS http://127.0.0.1:9093/-/healthy
   curl -fsS http://127.0.0.1:9100/metrics >/dev/null
   curl -fsS http://127.0.0.1:3001/api/health
   curl -fsS http://127.0.0.1:3000/api/v1/health
   curl -fsS http://127.0.0.1:3000/api/v1/metrics >/dev/null
   ```
8. Verify listening ports from host:
   ```bash
   ss -ltnp | grep -E ':(5432|5433|6379|8123|9000|9090|9092|9093|9100|29092|3001)\b'
   ```
9. Confirm expected exposure posture:
   - local-only: `5432`, `5433`, `6379`, `8123`, `9000`, `9090`, `9092`, `9093`, `9100`, `3001`
   - public: `29092`
10. Gửi một test alert và confirm Telegram receive path end-to-end

## Known limitations (track for future cleanup)

- Optional services vẫn cần được add scrape thủ công nếu enable sau này.
- Nếu team chuyển hoàn toàn sang `docker compose` plugin thay cho `docker-compose`, docs có thể được unify thêm cho nhất quán.
- Docker/container TLS trust path tới Telegram/package repos vẫn đáng theo dõi nếu environment thay đổi.
