# Hướng Dẫn Triển Khai Production

Hướng dẫn triển khai production cho Crypto Trading Backend trên Ubuntu Linux.

## Mục Lục

- [Yêu Cầu Hệ Thống](#yêu-cầu-hệ-thống)
- [Cấu Hình Chuẩn Bị (One-Time)](#cấu-hình-chuẩn-bị-one-time)
- [Triển Khai với Docker Compose](#triển-khai-với-docker-compose)
- [Triển Khai với Ansible](#triển-khai-với-ansible)
- [CI/CD với Jenkins](#cicd-với-jenkins)
- [Giám Sát (Monitoring)](#giám-sát-monitoring)
- [Sao Lưu & Phục Hồi](#sao-lưu--phục-hồi)
- [Bảo Mật](#bảo-mật)

---

## Yêu Cầu Hệ Thống

- Ubuntu 20.04+ LTS
- Docker Engine 20.10+
- Docker Compose v2
- 4GB RAM (tối thiểu), 8GB+ khuyến nghị
- 20GB disk space
- SSH access với sudo privileges

---

## Cấu Hình Chuẩn Bị (One-Time)

### 1. Cài Đặt Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install prerequisites
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Tạo User Deploy

```bash
# Create deploy user
sudo adduser deployer
sudo usermod -aG docker deployer

# Setup SSH key for deploy user
sudo -u deployer mkdir -p ~/.ssh
sudo -u deployer chmod 700 ~/.ssh
# Copy public key
cat ~/.ssh/id_rsa.pub | sudo tee -a ~deployer/.ssh/authorized_keys
sudo -u deployer chmod 600 ~/.ssh/authorized_keys
```

### 3. Cài Đặt Firewall (UFW)

```bash
# Enable UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow https
sudo ufw allow http
sudo ufw --force enable
```

### 4. Cài Đặt Fail2ban

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## Triển Khai với Docker Compose

### 1. Clone Repository

```bash
# Login as deployer
su - deployer

# Clone repository
git clone <your-repo-url> /home/ubuntu/be-cryptocurrency-trading-app
cd /home/ubuntu/be-cryptocurrency-trading-app
```

### 2. Tạo .env.production

```bash
# Copy example file
cp .env.production.example .env.production

# Edit with real values
nano .env.production
```

Thay tất cả `CHANGE_ME_*` với giá trị thực.

### 3. Tạo Thư Mục Cần Thiết

```bash
mkdir -p backups/db logs prometheus grafana/dashboards grafana/provisioning/datasources alertmanager
```

### 4. Baseline production networking posture

Thiết lập mặc định đã được xác minh an toàn cho VPS này:

- `BIND_HOST=127.0.0.1`
- `KAFKA_EXTERNAL_BIND_HOST=0.0.0.0`
- `APP_HOST=0.0.0.0`

Kết quả mong muốn trên host:

- local-only:
  - PostgreSQL → `127.0.0.1:5432`
  - Redis → `127.0.0.1:6379`
  - TimescaleDB → `127.0.0.1:5433`
  - ClickHouse HTTP → `127.0.0.1:8123`
  - ClickHouse TCP → `127.0.0.1:9000`
  - Kafka internal → `127.0.0.1:9092`
  - Prometheus → `127.0.0.1:9090`
  - Alertmanager → `127.0.0.1:9093`
  - Grafana → `127.0.0.1:3001`
  - Node Exporter → `127.0.0.1:9100`
- public:
  - Backend API → `0.0.0.0:3000`
  - Kafka external → `0.0.0.0:29092`

### 5. Triển Khai baseline production stack

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production ps
```

### 6. Chạy migrations trước khi đánh giá backend health

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production run --rm app npm run db:migrate:prod
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d app
```

Nếu bỏ qua bước này, backend có thể fail do thiếu schema và trông giống lỗi app/runtime dù root cause thực ra là DB chưa migrate.

### 7. Triển khai monitoring stack

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.monitoring.yml --env-file .env.production up -d --build
```

### 8. Recreate requirement sau khi harden port binding

Nếu bạn vừa đổi `BIND_HOST` hoặc published ports trong `.env.production`, chỉ `restart` là chưa đủ với container đã tồn tại. Cần recreate service bị ảnh hưởng để Docker áp dụng host bind mới.

Ví dụ đã dùng cho TimescaleDB và ClickHouse:

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate timescaledb clickhouse
```

### 9. Kiểm Tra Health

```bash
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/metrics >/dev/null
curl -fsS http://127.0.0.1:9090/-/healthy
curl -fsS http://127.0.0.1:9093/-/healthy
curl -fsS http://127.0.0.1:9100/metrics >/dev/null
curl -fsS http://127.0.0.1:3001/api/health
```

### 10. Kiểm tra listening ports trên host

```bash
ss -ltnp | grep -E ':(5432|5433|6379|8123|9000|9090|9092|9093|9100|29092|3000|3001)\b'
```

Kỳ vọng:
- local-only: `5432`, `5433`, `6379`, `8123`, `9000`, `9090`, `9092`, `9093`, `9100`, `3001`
- public: `3000`, `29092`
```
---

## Triển Khai với Ansible

### 1. Cài Đặt Ansible

```bash
# Install Ansible
sudo apt update
sudo apt install -y ansible

# Verify installation
ansible --version
```

### 2. Cấu Hình Inventory

Chỉnh sửa `ansible/inventory.yml` với IP thực của server:

```yaml
all:
  vars:
    ansible_user: deployer
    ansible_ssh_private_key_file: ~/.ssh/id_rsa
  children:
    production:
      hosts:
        prod-server-01:
          ansible_host: <YOUR_SERVER_IP>
```

### 3. Chạy Playbook

```bash
# Full deployment (Docker + App + Monitoring)
ansible-playbook -i inventory.yml playbook.yml

# Chỉ setup Docker
ansible-playbook -i inventory.yml playbook.yml --tags docker-setup

# Chỉ deploy app
ansible-playbook -i inventory.yml playbook.yml --tags deploy

# Chỉ deploy monitoring
ansible-playbook -i inventory.yml playbook.yml --tags monitoring
```

---

## CI/CD với Jenkins

### 1. Jenkins Plugins

Cài đặt các plugins sau:
- Docker Pipeline
- SSH Agent
- Telegram Notification
- Slack Notification
- HTML Publisher (cho coverage report)

### 2. Tạo Jenkins Credentials

Trong Jenkins > Manage Jenkins > Credentials:
- `docker-registry-credentials`: Docker registry username/password
- `ssh-deploy-key`: SSH private key cho deploy user
- `telegram-bot-token`: Telegram bot token
- `telegram-chat-id`: Telegram chat ID

### 3. Tạo Jenkins Job

1. New Item > Pipeline
2. Copy nội dung từ `Jenkinsfile`
3. Cấu hình parameters theo yêu cầu
4. Save and Build

### 4. Webhook Setup (GitHub)

Trong GitHub repository > Settings > Webhooks:
- Payload URL: `https://your-jenkins.com/github-webhook/`
- Content type: `application/json`
- Events: Push, Pull request

---

## Giám Sát (Monitoring)

### Truy Cập

| Service | URL | Default Login |
|---------|-----|---------------|
| Prometheus | http://localhost:9090 | - |
| Grafana | http://localhost:3001 | admin / (GF_SECURITY_ADMIN_PASSWORD) |
| Alertmanager | http://localhost:9093 | - |

### Baseline production posture on this VPS

- `docker-compose.prod.yml` is run from the repository root with `--env-file .env.production`.
- Internal data services are loopback-only by default via `BIND_HOST=127.0.0.1`:
  - PostgreSQL → `127.0.0.1:5432`
  - Redis → `127.0.0.1:6379`
  - TimescaleDB → `127.0.0.1:5433`
  - ClickHouse HTTP → `127.0.0.1:8123`
  - ClickHouse native TCP → `127.0.0.1:9000`
- Kafka is intentionally split across two listeners:
  - internal/local broker → `127.0.0.1:9092` on host, `kafka:9092` inside Docker
  - external/public broker → `0.0.0.0:29092` on host, advertised as `${APP_HOSTNAME}:29092`
- Monitoring endpoints stay loopback-only:
  - Prometheus → `127.0.0.1:9090`
  - Alertmanager → `127.0.0.1:9093`
  - Grafana → `127.0.0.1:3001`
  - Node Exporter → `127.0.0.1:9100`

### Monitoring deployment commands used on this VPS

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose --env-file .env.production -f docker-compose.monitoring.yml up -d --build
```

### Recreate requirement when hardening bind hosts / published ports

If you change `BIND_HOST` or published port mappings in `.env.production`, `docker restart` is **not** enough for existing containers. You must recreate the affected services so Docker applies the new host bind addresses.

Example used for data services after moving DB ports back to loopback:

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate timescaledb clickhouse
```


### Monitoring verification commands used on this VPS

```bash
curl -fsS http://127.0.0.1:9090/-/healthy
curl -fsS http://127.0.0.1:9093/-/healthy
curl -fsS http://127.0.0.1:9100/metrics >/dev/null && echo node_exporter_ok
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:9090/api/v1/targets
```

### Prometheus target policy

Default monitoring should scrape only services that are expected to be running in the baseline production profile:
- Prometheus
- Alertmanager
- Node Exporter
- Backend API
- Market Aggregator

Do **not** include optional profile-based services such as `matching-engine` and `public-ws-gateway` in the default Prometheus scrape config unless those profiles are intentionally enabled on the target server. This avoids false-red dashboards and noisy `down` target states after migration to a fresh VPS.

If those optional services are enabled later, add explicit scrape jobs for their real Docker-reachable names:
- `crypto_matching_engine:8081`
- `crypto_public_ws_gateway:8082`

### First boot / migration sequence on a new server

After bringing up the production stack, run database migrations before judging backend health:

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production run --rm app npm run db:migrate:prod
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d app
```

Without this step, the backend can fail with missing-table errors such as:
- `relation "integration_outbox" does not exist`
- `relation "system_configs" does not exist`

### Telegram alerting notes

1. Tạo Telegram Bot: @BotFather
2. Lấy bot token
3. Tạo group, add bot
4. Lấy chat ID: @userinfobot

### Alertmanager repeat interval và nội dung alert

Production monitoring hiện đang dùng `repeat_interval: 5m` để các alert còn firing được nhắc lại sau mỗi 5 phút.

Các file source of truth cần giữ đồng bộ:
- Runtime Compose config: `alertmanager/alertmanager.yml`
- Ansible template: `ansible/roles/monitoring/templates/alertmanager.yml.j2`
- Runtime alert rules: `prometheus/alerts.yml`
- Ansible alert template: `ansible/roles/monitoring/templates/alerts.yml.j2`
- Telegram webhook renderer: `alertmanager/telegram-bridge.js`

Khi thêm hoặc sửa alert rule:
- Luôn khai báo tối thiểu `summary`, `description`, `impact`, `action`
- Dùng labels như `{{ $labels.instance }}`, `{{ $labels.job }}`, `{{ $labels.mountpoint }}` để chỉ rõ server/container/filesystem bị ảnh hưởng nếu metric có label đó
- Thêm `runbook_url` hoặc `dashboard_url` nếu có link xử lý nhanh; Telegram bridge sẽ tự hiển thị
- Cập nhật cả `prometheus/alerts.yml` và `ansible/roles/monitoring/templates/alerts.yml.j2`, không chỉ sửa một nơi
- Giữ `{% raw %}` trong Ansible alert template khi có Prometheus template variables dạng `{{ $labels... }}` để tránh Jinja render nhầm

Sau khi đổi Alertmanager/Prometheus config:
```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.monitoring.yml --env-file .env.production up -d --build --force-recreate alertmanager prometheus telegram_bridge
```

Validate nhanh trước/sau deploy:
```bash
python3 - <<'PY'
import yaml
for p in ['prometheus/alerts.yml', 'alertmanager/alertmanager.yml']:
    with open(p) as f:
        yaml.safe_load(f)
    print('YAML_OK', p)
PY
node --check alertmanager/telegram-bridge.js
curl -fsS http://127.0.0.1:9090/-/healthy
curl -fsS http://127.0.0.1:9093/-/healthy
```

### Dashboard Grafana

Dashboard mặc định đã được provision tại `grafana/dashboards/default.json`:
- Backend Status
- CPU Usage
- Memory Usage
- Disk Usage
- Request Rate
- Latency

---

## Sao Lưu & Phục Hồi

### Sao Lưu Database

```bash
# Manual backup
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production exec postgres pg_dump -U crypto_user -d crypto_trading_platform -Fc -f /backups/backup_$(date +%Y%m%d).dump

# Auto backup (crontab)
0 2 * * * cd /home/ubuntu/be-cryptocurrency-trading-app && sudo docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres pg_dump -U crypto_user -d crypto_trading_platform -Fc -f /backups/backup_$(date +\%Y\%m\%d).dump
```

### Phục Hồi Database

```bash
# Stop app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production stop app

# Restore
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres pg_restore -U crypto_user -d crypto_trading_platform -c /backups/backup_YYYYMMDD.dump

# Start app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d app
```

### Rollback Deployment

```bash
# Rollback to previous version
./scripts/rollback.sh

# Rollback to specific image
./scripts/rollback.sh <image-tag>
```

---

## Bảo Mật

### 1. Secrets Management

- Tất cả secrets chỉ trong `.env.production` trên server
- Không bao giờ commit secrets vào git
- Sử dụng Ansible Vault cho encrypted inventory:

```bash
# Encrypt secrets
ansible-vault encrypt inventory.yml

# Edit encrypted file
ansible-vault edit inventory.yml

# Run playbook with vault
ansible-playbook -i inventory.yml playbook.yml --ask-vault-pass
```

### 2. Mã Hóa Database

Tất cả thông tin nhạy cảm đã được mã hóa bằng AES-256-GCM:
- Binance API Key/Secret
- Wallet Private Keys
- Seed Phrases

### 3. Network Security

- Chỉ expose port 80/443 ra ngoài
- PostgreSQL, Redis, monitoring chỉ listen localhost
- Sử dụng HTTPS cho tất cả traffic

### 4. Fail2ban

Fail2ban đã được cấu hình để bảo vệ SSH.

---

## Troubleshooting

### Container không start

```bash
# Check logs
docker compose logs app

# Check environment
docker compose exec app env
```

### Health check fail

```bash
# Check if port is accessible
curl -v http://localhost:3000/api/v1/health

# Check Docker network
docker network ls
docker network inspect crypto-trading-backend_network
```

### Database connection fail

```bash
# Check PostgreSQL
docker compose exec postgres pg_isready

# Check connection from app
docker compose exec app nc -zv postgres 5432
```

---

## License

MIT
