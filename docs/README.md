# Tài liệu backend (theo chủ đề)

Các file dưới đây mô tả **cấu hình, API và pattern kỹ thuật** — không thay thế [`../README.md`](../README.md) (hướng dẫn chạy app).

## Tài liệu chính

| Tài liệu | Nội dung |
|----------|----------|
| [ENV_CONFIG_USAGE.md](ENV_CONFIG_USAGE.md) | Biến môi trường, on-chain, PayOS, … |
| [REDIS_USAGE.md](REDIS_USAGE.md) | Redis, queue, lock |
| [WALLETCONNECT.md](WALLETCONNECT.md) | WalletConnect / Reown |
| [BINANCE_TESTNET_SETUP.md](BINANCE_TESTNET_SETUP.md) | Binance testnet |
| [DATA_ACCESS_PATTERNS.md](DATA_ACCESS_PATTERNS.md) | Repository Pattern, TransactionContext, hybrid ORM/SP |
| [BASE_REPOSITORY_USAGE.md](BASE_REPOSITORY_USAGE.md) | BaseRepository — method list |
| [TREASURY_DAILY_RUNBOOK.md](TREASURY_DAILY_RUNBOOK.md) | Treasury / job hằng ngày |
| [PROFILE_AVATAR_SECURITY_REVIEW.md](PROFILE_AVATAR_SECURITY_REVIEW.md) | Rà soát bảo mật avatar |
| [security-zones.md](security-zones.md) | CRITICAL/HIGH zones, invariants, incident response |

## Onboarding

| Tài liệu | Nội dung |
|----------|----------|
| [onboarding/day-1-setup.md](onboarding/day-1-setup.md) | Ngày 1: setup, IDE, cấu trúc dự án |
| [onboarding/ai-assisted-dev.md](onboarding/ai-assisted-dev.md) | AI-assisted workflow: stop-prompt-gate, quality gates |
| [onboarding/ecc-commands-quick-ref.md](onboarding/ecc-commands-quick-ref.md) | Lệnh slash `/ecc:*` và use-case map |

## Clean Architecture

Module `auth` và `orders` sử dụng **Clean Architecture** đầy đủ:

```
domain/ (ports) → application/ (use-cases) → infrastructure/ (persistence) → presentation (controllers)
```

Chi tiết: [DATA_ACCESS_PATTERNS.md](DATA_ACCESS_PATTERNS.md).
