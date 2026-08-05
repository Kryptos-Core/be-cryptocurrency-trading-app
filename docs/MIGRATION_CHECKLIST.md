# Migration Checklist

Checklist cực ngắn để bring up production stack trên server mới theo trạng thái final đã harden.

## 1) Vào repo

```bash
cd /home/ubuntu/be-cryptocurrency-trading-app
```

## 2) Chuẩn bị `.env.prod`

Đảm bảo ít nhất các biến sau có giá trị thật:
- `BIND_HOST=127.0.0.1`
- `KAFKA_EXTERNAL_BIND_HOST=0.0.0.0`
- `APP_HOST=0.0.0.0`
- `GF_SECURITY_ADMIN_PASSWORD`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- toàn bộ DB/app secrets production khác

## 3) Bring up baseline production stack

```bash
sudo docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
sudo docker-compose -f docker-compose.prod.yml --env-file .env.prod ps
```

## 4) Chạy migrations trước khi kết luận backend lỗi

```bash
sudo docker-compose -f docker-compose.prod.yml --env-file .env.prod run --rm app npm run db:migrate:prod
sudo docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d app
```

## TypeORM `ALTER TYPE ... ADD VALUE`

Backend cấu hình `migrationsTransactionMode: 'each'` trong `src/config/data-source.ts`, trong khi PostgreSQL cấm `ALTER TYPE ... ADD VALUE` bên trong transaction. Với migration thêm enum value, dùng pattern trong `src/migrations/1700000002000-AddAuthSecurityCategoryToSystemConfigs.ts`: nếu `queryRunner.isTransactionActive` thì commit, chạy `ALTER TYPE` trên connection không có transaction, rồi `startTransaction()` lại. Migration mẫu thêm `auth_security` vào `system_configs_category_enum`; không sửa migration đã deploy.

## 5) Bring up monitoring stack

```bash
sudo docker-compose -f docker-compose.monitoring.prod.yml --env-file .env.prod up -d --build
```

## 6) Nếu vừa đổi bind host / published ports, recreate service bị ảnh hưởng

Ví dụ với TimescaleDB + ClickHouse:

```bash
sudo docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate timescaledb clickhouse
```

## 7) Verify health

```bash
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/metrics >/dev/null
curl -fsS http://127.0.0.1:9090/-/healthy
curl -fsS http://127.0.0.1:9093/-/healthy
curl -fsS http://127.0.0.1:9100/metrics >/dev/null
curl -fsS http://127.0.0.1:3001/api/health
```

## 8) Verify listening ports

```bash
ss -ltnp | grep -E ':(5432|5433|6379|8123|9000|9090|9092|9093|9100|29092|3000|3001)\b'
```

Expected:
- local-only: `5432`, `5433`, `6379`, `8123`, `9000`, `9090`, `9092`, `9093`, `9100`, `3001`
- public: `3000`, `29092`

## 9) Final sanity check

- Backend healthy tại `/api/v1/health`
- Monitoring stack healthy
- Kafka split đúng: `9092` local / `29092` public
- DB + monitoring ports không public ra Internet
- Nếu Telegram alerts được bật: gửi test alert end-to-end
