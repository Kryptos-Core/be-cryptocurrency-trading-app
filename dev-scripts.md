# Dev Scripts — Cách sử dụng

File `dev-scripts.json` chứa các lệnh **ít dùng**, không có trong `package.json` scripts chính.

## Chạy nhanh

```bash
# Liệt kê tất cả lệnh có sẵn
node scripts/run-dev-script.mjs

# Chạy một lệnh cụ thể
node scripts/run-dev-script.mjs db:clean
node scripts/run-dev-script.mjs lint:boundaries
node scripts/run-dev-script.mjs treasury:e2e
```

## Tra cứu nhanh theo nhóm

| Nhóm | Keys |
|------|------|
| Build | `prebuild`, `start:staging` |
| Format | `format`, `format:check` |
| Lint | `lint:boundaries`, `lint:uow` |
| Migration | `migration:generate`, `migration:create`, `migration:revert`, `migration:show` |
| Database | `db:clean`, `db:outbox:reset` |
| ClickHouse | `db:migrate:ch`, `db:migrate:ch:status`, `clickhouse:tables:list`, `clickhouse:init:run` |
| Docker | `docker:infra:logs`, `docker:infra:health` |
| Kafka | `kafka:topics:create` |
| Treasury | `treasury:e2e`, `treasury:health`, `treasury:daily`, `treasury:schedule:register`, `treasury:schedule:unregister` |
| Test | `test:watch` |
