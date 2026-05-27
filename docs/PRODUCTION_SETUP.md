# Production Setup Guide

> Hướng dẫn setup hạ tầng production cho `kryptos-core-vps` — bao gồm VPS, Docker, Nginx, Cloudflare Tunnel, và các bước debug đã trải qua.

---

## 1. Tổng Quan Hạ Tầng

```
Internet (HTTPS)
      │
      ▼
Cloudflare (Proxy + SSL termination)
      │  Cloudflare Tunnel (QUIC/HTTP2)
      ▼
cloudflared daemon (chạy trên VPS)
      │  HTTP
      ▼
NestJS App (Docker container, port 3000)
      │
      ├── PostgreSQL (port 5432)
      ├── TimescaleDB (port 5433)
      ├── Redis (port 6379)
      ├── Kafka (port 9092)
      ├── ClickHouse (port 8123/9000)
      └── Monitoring: Prometheus + Grafana + Alertmanager
```

### Tại sao dùng Cloudflare Tunnel?

VPS được thuê qua **chiasegpu.vn** — đây là KVM VM với NAT networking:
- IP thực của VM: `192.168.122.80` (private)
- IP public của hypervisor host: `123.16.178.176`
- Hypervisor **không** tự động forward port 80/443 vào VM

→ Không thể dùng DNS A record trỏ thẳng về IP public.  
→ Cloudflare Tunnel bypass hoàn toàn vấn đề NAT — tunnel kết nối ra ngoài từ trong VM, không cần inbound port forwarding.

---

## 2. Thông Tin VPS

| Thông số | Giá trị |
|---|---|
| Provider | chiasegpu.vn |
| Hostname | `kryptos-core-vps` |
| VM IP (private) | `192.168.122.80` |
| Hypervisor IP (public) | `123.16.178.176` |
| OS | Ubuntu 22.04 LTS |
| User | `ubuntu` |
| Project dir | `/home/ubuntu/be-cryptocurrency-trading-app` |

---

## 3. Docker Setup

### Khởi động toàn bộ stack

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### Kiểm tra trạng thái

```bash
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production ps
```

### Services và ports (bind theo trạng thái final đã harden)

| Service | Container | Port |
|---|---|---|
| NestJS App | `crypto_backend` | `0.0.0.0:3000` |
| PostgreSQL | `crypto_postgres` | `127.0.0.1:5432` |
| TimescaleDB | `crypto_timescaledb` | `127.0.0.1:5433` |
| Redis | `crypto_redis` | `127.0.0.1:6379` |
| Kafka internal | `crypto_kafka` | `127.0.0.1:9092` |
| Kafka external | `crypto_kafka` | `0.0.0.0:29092` |
| ClickHouse | `crypto_clickhouse` | `127.0.0.1:8123`, `127.0.0.1:9000` |
| Prometheus | `prometheus` | `127.0.0.1:9090` |
| Grafana | `grafana` | `127.0.0.1:3001` |
| Alertmanager | `alertmanager` | `127.0.0.1:9093` |
| Node Exporter | `node_exporter` | `127.0.0.1:9100` |

> **Lưu ý:** Baseline production posture chỉ public `3000` (backend) và `29092` (Kafka external). Toàn bộ DB, monitoring, và Kafka internal listener phải loopback-only.

### Backend healthcheck

Healthcheck của `crypto_backend` phải dùng đúng path:

```yaml
# docker-compose.prod.yml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/api/v1/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

> ⚠️ **Lỗi thường gặp:** Dùng `/health` thay vì `/api/v1/health` → container bị `unhealthy`.
> App có global prefix `/api/v1`, nên health endpoint là `/api/v1/health`.

### Migration requirement sau first boot

Trên server mới, backend có thể chưa healthy ngay nếu database schema chưa được migrate. Đây không nhất thiết là lỗi app.

Sequence đã được xác minh:

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production run --rm app npm run db:migrate:prod
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d app
```

Các lỗi từng gặp khi thiếu schema:
- `relation "integration_outbox" does not exist`
- `relation "system_configs" does not exist`

### Recreate requirement khi đổi BIND_HOST / published ports

Nếu đổi `BIND_HOST` hoặc port mapping trong `.env.production`, `docker restart` là chưa đủ với container cũ. Cần recreate service để host bind mới có hiệu lực.

Ví dụ:

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
sudo docker-compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate timescaledb clickhouse
```

### Verification commands

```bash
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/metrics >/dev/null
curl -fsS http://127.0.0.1:9090/-/healthy
curl -fsS http://127.0.0.1:9093/-/healthy
curl -fsS http://127.0.0.1:9100/metrics >/dev/null
curl -fsS http://127.0.0.1:3001/api/health
ss -ltnp | grep -E ':(5432|5433|6379|8123|9000|9090|9092|9093|9100|29092|3000|3001)\b'
```

---

## 4. Nginx

Nginx chạy trực tiếp trên host (không phải trong Docker), làm reverse proxy cho app.

### Config file

```
/etc/nginx/sites-available/api-kryptos-core
/etc/nginx/sites-enabled/api-kryptos-core  (symlink)
```

### Nội dung config

```nginx
server {
    listen 80;
    server_name api-kryptos-core.maxnoah.io.vn;

    # Cloudflare real IP
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    # ... (các Cloudflare IP ranges)
    real_ip_header CF-Connecting-IP;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}

server {
    listen 443 ssl;
    server_name api-kryptos-core.maxnoah.io.vn;

    ssl_certificate     /etc/nginx/ssl/api-kryptos-core.crt;
    ssl_certificate_key /etc/nginx/ssl/api-kryptos-core.key;
    # ... SSL config

    location / {
        proxy_pass http://127.0.0.1:3000;
        # ... proxy headers
    }
}
```

> **Lưu ý:** SSL cert tại `/etc/nginx/ssl/` là **self-signed** — chỉ dùng cho kết nối nội bộ.  
> HTTPS public được handle bởi Cloudflare, không phải nginx trực tiếp.

### Reload nginx

```bash
sudo systemctl reload nginx
# hoặc
sudo nginx -s reload
```

---

## 5. Cloudflare Tunnel

### Tại sao cần Cloudflare Tunnel?

Do VPS nằm sau NAT của chiasegpu, không thể expose port 80/443 ra internet trực tiếp. Cloudflare Tunnel tạo kết nối outbound từ VPS ra Cloudflare edge — không cần inbound port forwarding.

### Cài đặt cloudflared

```bash
# Download và cài .deb package
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb
```

### Tạo tunnel trên Cloudflare Dashboard

1. Vào [dash.cloudflare.com](https://dash.cloudflare.com) → **Zero Trust** → **Networks** → **Tunnels**
2. **Create a tunnel** → chọn **Cloudflared**
3. Đặt tên tunnel (vd: `kryptos-core`) → Save
4. Chọn OS: **Debian** (Ubuntu dùng được, Ubuntu là Debian-based)
5. Copy lệnh install có token

### Cài service với token

```bash
sudo cloudflared service install <TOKEN>
sudo systemctl start cloudflared
sudo systemctl enable cloudflared  # auto-start on boot
```

### Kiểm tra trạng thái

```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
```

Tunnel healthy sẽ thấy log:
```
INF Registered tunnel connection connIndex=0 ... location=hkg09 protocol=quic
INF Registered tunnel connection connIndex=1 ... location=hkg10 protocol=quic
INF Registered tunnel connection connIndex=2 ... location=hkg08 protocol=quic
INF Registered tunnel connection connIndex=3 ... location=hkg01 protocol=quic
```

### Cấu hình Public Hostname Route

Trong Cloudflare Dashboard → tunnel `kryptos-core` → **Public Hostname** (hoặc **Published application routes**):

| Field | Giá trị |
|---|---|
| Subdomain | `api-kryptos-core` |
| Domain | `maxnoah.io.vn` |
| **Path** | *(để trống)* |
| Type | `HTTP` |
| URL | `localhost:3000` |

> ⚠️ **Lỗi thường gặp:** Field **Path** bị điền nhầm `HTTP` → tunnel chỉ match request có path `/HTTP`, tất cả request khác trả về 404.  
> **Fix:** Edit route → xóa trắng field Path → Save.

Cloudflare sẽ tự tạo DNS CNAME record cho `api-kryptos-core.maxnoah.io.vn`.

---

## 6. DNS Configuration

| Record | Type | Value | Proxy |
|---|---|---|---|
| `api-kryptos-core` | CNAME | `<tunnel-id>.cfargotunnel.com` | ✅ Proxied |

> DNS record được Cloudflare tự tạo khi setup Public Hostname trong tunnel.  
> **Không** dùng A record trỏ về IP public của hypervisor (`123.16.178.176`) — traffic sẽ không vào được VM.

---

## 7. Kiểm Tra Sau Deploy

```bash
# Health check
curl https://api-kryptos-core.maxnoah.io.vn/api/v1/health

# Expected response:
# {"success":true,"data":{"ok":true,"timestamp":"..."},"timestamp":"..."}

# Kiểm tra Docker containers
docker ps

# Kiểm tra cloudflared
sudo systemctl status cloudflared

# Kiểm tra nginx
sudo systemctl status nginx
```

---

## 8. Troubleshooting

### Container `crypto_backend` unhealthy

```bash
# Kiểm tra health endpoint đúng path
curl http://localhost:3000/api/v1/health

# Xem logs
docker logs crypto_backend --tail=50
```

### HTTPS trả về 404 từ Cloudflare

1. Kiểm tra DNS đã propagate chưa: `dig api-kryptos-core.maxnoah.io.vn +short @1.1.1.1`
2. Kiểm tra cloudflared đang chạy: `sudo systemctl status cloudflared`
3. Kiểm tra route config trong Cloudflare Dashboard — field **Path** phải để trống
4. Xem live logs tunnel: Cloudflare Dashboard → tunnel → **Live logs**

### Cloudflared không kết nối được

```bash
sudo journalctl -u cloudflared -n 50 --no-pager
# Restart nếu cần
sudo systemctl restart cloudflared
```

### Nginx không nhận request từ Cloudflare

```bash
# Kiểm tra nginx đang chạy
sudo systemctl status nginx

# Xem access log
tail -f /var/log/nginx/access.log

# Test local
curl http://localhost/api/v1/health -H "Host: api-kryptos-core.maxnoah.io.vn"
```

---

## 9. Auto-start on Reboot

Tất cả services đều được cấu hình auto-start:

```bash
# Docker containers (restart: unless-stopped trong compose file)
# Tự restart khi Docker daemon khởi động

# cloudflared
sudo systemctl enable cloudflared

# nginx
sudo systemctl enable nginx
```

---

*Tài liệu này được tạo ngày 2026-05-22 sau quá trình setup production lần đầu.*
