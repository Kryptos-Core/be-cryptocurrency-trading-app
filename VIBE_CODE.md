# Vibe Code — NestJS backend

**Vibe Code** là tên gọi chuẩn AI-assisted development của team: cùng một bộ rules, skills, hooks và hướng dẫn agent (ECC-aligned) để mọi người dùng Cursor / Copilot / Claude Code / Codex vẫn thống nhất style, bảo mật và quy trình.

## Workspace (cách mở repo — chuẩn team)

- **Cursor / VS Code / Codex CLI:** mở **thư mục gốc repo backend này** (cùng cấp với `package.json`, `src/`, `.cursor/`).
- **Không** bắt buộc mở monorepo cha; team BE clone **repo backend** và làm việc trong một workspace độc lập với team FE.
- Rule Flutter/UI không nằm trong repo này (đã bỏ file rule FSD trùng stack FE); UI thuộc **repo Flutter** của team FE.

## Cấu trúc trong repo

| Thư mục / file | Mục đích |
|-----------------|----------|
| `.cursor/rules/` | Rules Cursor — **nguồn chính** (TypeScript, API, DB, performance, common…) |
| `.cursor/hooks/` + `hooks.json` | Hook Cursor |
| `.cursor/agents/`, `.cursor/commands/` | Agent & slash command ECC trên Cursor |
| `.github/instructions/` | Mirror cho **GitHub Copilot Chat / Agent** |
| `.github/copilot-instructions.md` | Điểm vào Copilot |
| `.agents/skills/` | Skills **Codex CLI** |
| `.codex/` | Codex config + MCP + multi-agent |
| `.claude/CLAUDE.md` | Bối cảnh nhanh **Claude Code** (API, module nhạy cảm) |
| `AGENTS.md` | Mục lục + liên kết `.cursor/AGENTS.md` |
| `ECC-COMMANDS.md` | Tra cứu lệnh ECC / CCG |

## Lọc skill AI (không gói chéo FE)

- **Đã gỡ** khỏi BE: `dart-flutter-patterns`, Playwright (`e2e-testing`), React/Next (`frontend-*`, `nextjs-turbopack`).
- **Giữ** cho Cursor: `nestjs-patterns`, `backend-patterns`, `database-migrations` và skill chung (security, TDD, API, MCP, v.v.).
- **Codex** (`.agents/skills/`): không còn Flutter hay E2E UI web Playwright; test API dùng Jest/supertest theo README dự án.

## Ưu tiên rule theo ngữ cảnh (NestJS / API)

1. `typescript-*`, `api-design-architecture-patterns.mdc`, `modern-api-system-design-standards.mdc`
2. `backend-data-performance.mdc`, `pagination-best-practices.mdc`
3. `common-*` (security, testing, git, patterns)

## Vùng nhạy cảm (bắt buộc đọc trước khi sửa)

- **`orders/`**, **`matching/`**: luồng khớp lệnh, Redis lock, circuit breaker, audit — thay đổi phải kèm test và đánh giá rủi ro.
- **Migration / entity**: không xóa migration đã chạy; giữ đồng bộ với DB thật.
- **Env**: mọi biến mới vào `ConfigService` phải có trong `src/config/env.validation.ts`.
- **UserRole**: chỉ giá trị đã định nghĩa trong `src/common/enums`.

## Glob / `applyTo` (Cursor & Copilot)

`globs` / `applyTo` **tính từ root repo backend** (folder workspace bạn mở), **không** dùng tiền tố `be-.../` của layout monorepo nhiều project.

- **DB / hiệu năng CSDL:** `**/*.{ts,js,sql}`
- **API / contract / config:** `**/*.{ts,tsx,js,mjs,cjs,json,yml,yaml,md}`

## Việc cần làm khi chỉnh rule

1. Sửa **`.cursor/rules/`**.
2. Cập nhật **`.github/instructions/`** tương ứng (`applyTo` khớp `globs`).

## Codex / MCP

- `.codex/config.toml` — MCP mặc định ECC; credentials qua env.

## Backend — checklist nhanh

```bash
npm install
npm run lint   # hoặc biome/eslint theo README
npm test
```

Chi tiết chạy local, Docker, migration: [README.md](./README.md).

## Đồng bộ giữa các bản sao Vibe Code (tùy chọn)

Có thể copy `.cursor/`, `.github/`, … từ bản mẫu nội bộ rồi **rà lại glob/`applyTo` và bỏ rule không thuộc stack Nest** (giống repo này). Nguồn chuẩn cho team BE là **repo backend này**.
