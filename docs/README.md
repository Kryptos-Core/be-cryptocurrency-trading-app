# Tài liệu — be-cryptocurrency-trading-app

> Last reviewed: 2026-07-28 — verified against `package.json`, `.env.development.example`, `src/modules/`, `docker-compose.infrastructure.yml`, `go-services/`.

Đây là chỉ mục toàn bộ tài liệu trong repo NestJS backend. Team BE dùng repo này làm workspace độc lập (xem `AGENTS.md`); FE Flutter là repo riêng.

## Onboarding

| File | Mục đích |
|------|---------|
| [`README.md`](../README.md) | Stack, scripts, env var map nhanh, seed accounts. |
| [`docs/onboarding/day-1-setup.md`](onboarding/day-1-setup.md) | Clone → docker:infra:up → npm install → db:migrate → dev. |
| [`docs/onboarding/ai-assisted-dev.md`](onboarding/ai-assisted-dev.md) | Cursor / Claude Code / Code tour workflow; sensitive zone protocol. |
| [`docs/onboarding/ecc-commands-quick-ref.md`](onboarding/ecc-commands-quick-ref.md) | Slash commands ECC + quality checklist copy vào PR. |

## Architecture & Coding Style

| File | Mục đích |
|------|---------|
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Outbox relay, CQRS bus, UoW, read model, ranh giới module. |
| [`docs/ARCHITECTURE_FULL_ROLLOUT.md`](ARCHITECTURE_FULL_ROLLOUT.md) | `published_at`, skip_locked, on-chain deposits read path, notification idempotent. |
| [`docs/bounded-contexts.md`](bounded-contexts.md) | Bảng bounded contexts ↔ Nest module. |
| [`docs/ubiquitous-language.md`](ubiquitous-language.md) | Thuật ngữ trading / outbox / read model. |
| [`docs/DATA_ACCESS_PATTERNS.md`](DATA_ACCESS_PATTERNS.md) | Repository + ORM + Raw SQL; TransactionContext; SP/QB/ORM matrix. |
| [`docs/BASE_REPOSITORY_USAGE.md`](BASE_REPOSITORY_USAGE.md) | `BaseRepository` method list (find/save/transaction/query). |
| [`docs/REDIS_USAGE.md`](REDIS_USAGE.md) | Cache, lock khớp lệnh, lock relay outbox, idempotency, WC session. |
| [`docs/worker-pool-inventory.md`](worker-pool-inventory.md) | Piscina tasks CPU-bound; matching single-thread; outbox scale consumers. |
| [`AGENTS.md`](../AGENTS.md), [`VIBE_CODE.md`](../VIBE_CODE.md), [`CONTRIBUTING-RULES.md`](../CONTRIBUTING-RULES.md), [`ECC-COMMANDS.md`](../ECC-COMMANDS.md) | AI workflow, conventions, PR process. |

## Configuration & Environment

| File | Mục đích |
|------|---------|
| [`docs/ENV_CONFIG_USAGE.md`](ENV_CONFIG_USAGE.md) | Danh sách env var đầy đủ (CORE_DB, MARKET_TS, EVENT_OUTBOX, KAFKA, matching, exchange, on-chain, encryption, SMTP, Firebase, safety flags). |
| [`docs/WALLETCONNECT.md`](WALLETCONNECT.md) | WC v2 / Reown, route REST, SignClient singleton, env whitelist. |
| [`docs/BINANCE_TESTNET_SETUP.md`](BINANCE_TESTNET_SETUP.md) | Testnet config + endpoint đồng bộ thủ công. |
| [`docs/PROFILE_AVATAR_SECURITY_REVIEW.md`](PROFILE_AVATAR_SECURITY_REVIEW.md) | Cloudinary avatar + security change request workflow. |

## Deployment & Operations

| File | Mục đích |
|------|---------|
| [`DEPLOYMENT.md`](../DEPLOYMENT.md) | Production playbook (Ubuntu, Docker Compose, Ansible, Jenkins, monitoring). |
| [`docs/MIGRATION_CHECKLIST.md`](MIGRATION_CHECKLIST.md) | Bring-up checklist trên server mới. |
| [`docs/SEED-USERS-PROD.md`](SEED-USERS-PROD.md) | Seed users từ `users.json.enc` lên production DB. |
| [`docs/MONITORING_DEPLOYMENT_NOTES.md`](MONITORING_DEPLOYMENT_NOTES.md) | Ghi chép tăng cường monitoring/alerting. |
| [`docs/TREASURY_DAILY_RUNBOOK.md`](TREASURY_DAILY_RUNBOOK.md) | Runbook treasury: `treasury:daily` script + Task Scheduler. |
| [`docs/PRODUCTION_SETUP.md`](PRODUCTION_SETUP.md) | VPS cũ (chiasegpu.vn) + Cloudflare Tunnel — **historical reference**. |

## Reference / Plans (đánh dấu cần review)

Các plan dưới đây lớn, đã superseded một phần. Trước khi dùng, đọc status banner ở đầu file.

| File | Status |
|------|--------|
| [`docs/INFRASTRUCTURE.md`](INFRASTRUCTURE.md) | Superseded; đề xuất archive. |
| [`docs/KAFKA_EVENT_BUS_SOURCE_OF_TRUTH_PLAN.md`](KAFKA_EVENT_BUS_SOURCE_OF_TRUTH_PLAN.md) | Superseded bởi ADR-001 (relay/projection decoupling); đề xuất archive. |
| [`docs/MULTI_DATABASE_TS_GO_ROADMAP.md`](MULTI_DATABASE_TS_GO_ROADMAP.md) | Roadmap 2026-04; phần runtime đã superseded; đề xuất archive. |
| [`docs/GO_SHADOW_MATCHING_PLAN.md`](GO_SHADOW_MATCHING_PLAN.md) | Plan Phase 6-8; runtime ở [`GO_SERVICES_PRODUCTION_ROLLOUT.md`](GO_SERVICES_PRODUCTION_ROLLOUT.md). |
| [`docs/GO_SERVICES_PRODUCTION_ROLLOUT.md`](GO_SERVICES_PRODUCTION_ROLLOUT.md) | Trạng thái thực tế rollout Go services. |
| [`docs/GO_PUBLIC_WS_ROLLOUT_RUNBOOK.md`](GO_PUBLIC_WS_ROLLOUT_RUNBOOK.md) | Ticker/Public WS rollout feature flags. |
| [`docs/GO_REAL_TRAFFIC_AND_MUTATION_PLAN.md`](GO_REAL_TRAFFIC_AND_MUTATION_PLAN.md) | Real traffic + matching mutation guardrails. |
| [`docs/MOCK_DATA_AUDIT.md`](MOCK_DATA_AUDIT.md) | Audit mock data (seed + mock exchange). |
| [`docs/TREASURY_E2E_CONFIG_DB_UI_PLAN.md`](TREASURY_E2E_CONFIG_DB_UI_PLAN.md) | Treasury E2E config — done for core rollout. |

## Workflow liên quan FE

| Liên kết | Mô tả |
|---------|-------|
| BE `REOWN_PROJECT_ID` ↔ FE `WALLETCONNECT_PROJECT_ID` | Cùng project Reown Cloud; xem [`WALLETCONNECT.md`](WALLETCONNECT.md) + FE README. |
| BE `ONCHAIN_OPERATOR_MODE` ↔ FE `ONCHAIN_OPERATOR_MODE` | Phải đồng bộ (sandbox ↔ development/testnet; production ↔ mainnet). |
| API contract | OpenAPI `/api/docs`; thay đổi phải báo team FE qua OpenAPI + tài liệu. |

## Modules nhanh

```
src/modules/
├── auth/                    ✓ Clean Architecture (use-cases + ports)
├── orders/                  ✓ Clean Architecture + CQRS (aggregate pilot)
├── matching/                ⚠ SENSITIVE — Redis Lua lock, STP, circuit breaker
├── wallets/                 Hybrid
├── users/
├── user-binance-credentials/  AES-256-GCM credential storage
├── treasury/                ⚠ SENSITIVE
├── blockchain/              UoW + outbox for on-chain deposits
├── deposits/  payment-config/  managed-wallets/
├── market-maker/  metadata/  dashboard/
├── system-config/           Runtime config (DB → Redis → .env)
├── currencies/  exchange-rate/
├── notifications/  markets/  trading/
├── binance-rest/  binance-proxy/  price-oracle/  exchange/   ← adapters
└── redis/                                                ← adapter (singleton)
```

Xem chi tiết: [`ARCHITECTURE.md`](ARCHITECTURE.md), [`bounded-contexts.md`](bounded-contexts.md).

## Scripts / commands thường dùng

```bash
npm install
npm run docker:infra:up          # PostgreSQL + Redis
npm run db:migrate               # TypeORM migrations
npm run db:seed                  # seed users
npm run dev                      # nest start --watch (dev)
npm run lint                     # Biome
npm run lint:boundaries          # module boundary guard
npm run lint:uow                 # dataSource.transaction guard
npm test                         # Jest
npm run deploy:prod:full         # production deploy + migrate
```

Xem đầy đủ: [`README.md`](../README.md) mục **Scripts quan trọng**.