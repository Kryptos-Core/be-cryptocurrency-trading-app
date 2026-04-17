# be-cryptocurrency-trading-app — Cursor, Claude Code, Codex

## Workspace (quan trọng)

Mở **đúng thư mục gốc repo NestJS này** làm folder workspace (cùng cấp `package.json`). Team BE clone repo backend, làm việc độc lập; **đồng nhất Vibe Code** nhờ `.cursor/`, `.agents/`, `.codex/`, `.claude/` trong repo — không cần mở monorepo cha.

## Tài liệu team

- [VIBE_CODE.md](./VIBE_CODE.md) — Chuẩn AI coding của team BE
- [CONTRIBUTING-RULES.md](./CONTRIBUTING-RULES.md) — Conventions + PR process
- [docs/security-zones.md](./docs/security-zones.md) — **ĐỌC TRƯỚC KHI SỬA** sensitive modules
- [docs/onboarding/](./docs/onboarding/) — Onboarding guides (day-1, ai-dev, ecc-ref)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — Outbox relay, UoW, CQRS bus, read model, ranh giới module
- [docs/ARCHITECTURE_FULL_ROLLOUT.md](./docs/ARCHITECTURE_FULL_ROLLOUT.md) — `published_at`, skip_locked, on-chain deposits read path
- [README.md](./README.md) — Full setup + module docs

## Stack

- **NestJS / TypeScript** — `src/`, `package.json`. API & vận hành: [README.md](./README.md).

## ECC (đã tích hợp sẵn)

| Thành phần | Vai trò |
|------------|---------|
| `.cursor/rules/` + hooks | Rules & automation Cursor |
| `.cursor/agents`, `commands` | Agent/command ECC cho Cursor |
| `.agents/skills/` | Skills Codex (OpenAI) — `SKILL.md` + `agents/openai.yaml` |
| `.codex/` | `config.toml`, MCP, multi-agent Codex CLI |
| `.claude/CLAUDE.md` | Ngữ cảnh nhanh cho Claude Code |

**Hướng dẫn agent chi tiết:** [`.cursor/AGENTS.md`](./.cursor/AGENTS.md).

**Lệnh slash / multi-agent ECC:** [ECC-COMMANDS.md](./ECC-COMMANDS.md).

## Upstream ECC — [everything-claude-code](https://github.com/affaan-m/everything-claude-code.git) (tùy chọn)

Dùng khi bạn muốn **Codex toàn máy** hoặc **Claude Code full plugin** giống bản upstream; hằng ngày chỉ mở repo NestJS này vẫn đủ nhờ `.codex/` + `.agents/` đã có sẵn.

| Mục đích | Việc cần làm |
|----------|----------------|
| **Codex trong repo này** | Mở folder này làm workspace; không bắt buộc clone upstream. |
| **Merge ECC → `~/.codex/`** | Clone upstream (trong monorepo cha: `../everything-claude-code`). `cd` vào đó → `npm install` → `bash scripts/sync-ecc-to-codex.sh` (Git Bash / WSL). Tuỳ chọn `--dry-run`, `--update-mcp`. Chi tiết merge MCP: [`.codex/AGENTS.md`](./.codex/AGENTS.md). |
| **Plugin Codex (preview)** | Từ **root** clone upstream: `codex plugin install ./` — xem `everything-claude-code/.codex-plugin/README.md`. |
| **Claude Code đầy đủ ECC** | Plugin: `/plugin marketplace add https://github.com/affaan-m/everything-claude-code` → `/plugin install ecc@ecc`. Hoặc OSS: trong clone upstream `npm install` rồi Windows `.\install.ps1`, Unix `./install.sh` (xem upstream README). Repo này chỉ bổ sung ngữ cảnh qua `.claude/CLAUDE.md`. |

Chi tiết và lưu ý xung đột với Vibe Code: [AGENTS.md ở monorepo cha](../AGENTS.md) (mục “Upstream ECC”).

## Nguyên tắc ngắn

1. Không commit `.env*`, khóa ví, RPC secrets, credential thật.
2. Module `matching/`, `orders/` cực nhạy — luôn có test và mô tả rủi ro khi đổi luồng khớp lệnh.
3. Biến env mới → cập nhật `src/config/env.validation.ts` (theo README).
4. Trả lời user tiếng Việt khi họ dùng tiếng Việt; thuật ngữ kỹ thuật giữ tiếng Anh chuẩn ngành.
