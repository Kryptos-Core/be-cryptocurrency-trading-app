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
git clone <your-repo-url> /opt/crypto-trading
cd /opt/crypto-trading
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

### 4. Triển Khai

```bash
# Pull images
docker compose pull

# Start services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f app
```

### 5. Kiểm Tra Health

```bash
# Health check
curl http://localhost:3000/health

# Hoặc sử dụng script
./scripts/health-check.sh
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

### Alert Telegram

1. Tạo Telegram Bot: @BotFather
2. Lấy bot token
3. Tạo group, add bot
4. Lấy chat ID: @userinfobot

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
docker compose exec postgres pg_dump -U crypto_user -d crypto_trading_platform -Fc -f /backups/backup_$(date +%Y%m%d).dump

# Auto backup (crontab)
0 2 * * * docker compose -f /opt/crypto-trading/docker-compose.yml exec -T postgres pg_dump -U crypto_user -d crypto_trading_platform -Fc -f /backups/backup_$(date +\%Y\%m\%d).dump
```

### Phục Hồi Database

```bash
# Stop app
docker compose stop app

# Restore
docker compose exec -T postgres pg_restore -U crypto_user -d crypto_trading_platform -c /backups/backup_YYYYMMDD.dump

# Start app
docker compose up -d app
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
curl -v http://localhost:3000/health

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
