# be-cryptocurrency-trading-app — Agent / Codex / Copilot

## Workspace (quan trọng)

Mở **đúng thư mục gốc repo NestJS này** làm folder workspace (cùng cấp `package.json`). Team BE clone repo backend, làm việc độc lập; **đồng nhất Vibe Code** nhờ `.cursor/`, `.github/`, `.agents/`, `.codex/`, `.claude/` trong repo — không cần mở monorepo cha.

## Vibe Code

**Chuẩn AI chung của team:** [VIBE_CODE.md](./VIBE_CODE.md). Mọi Cursor, Copilot Chat/Agent, Claude Code, Codex CLI trong repo này đều bám theo các thư mục `.cursor/`, `.github/instructions/`, `.agents/`, `.codex/`, `.claude/`.

## Stack

- **NestJS / TypeScript** — `src/`, `package.json`. API & vận hành: [README.md](./README.md).

## ECC (đã tích hợp sẵn)

| Thành phần | Vai trò |
|------------|---------|
| `.cursor/rules/` + hooks | Rules & automation Cursor |
| `.cursor/agents`, `commands` | Agent/command ECC cho Cursor |
| `.github/instructions/` + `copilot-instructions.md` | Copilot Chat / Agent (VS Code / GitHub) |
| `.agents/skills/` | Skills Codex (OpenAI) — `SKILL.md` + `agents/openai.yaml` |
| `.codex/` | `config.toml`, MCP, multi-agent Codex CLI |
| `.claude/CLAUDE.md` | Ngữ cảnh nhanh cho Claude Code |

**Hướng dẫn agent chi tiết:** [`.cursor/AGENTS.md`](./.cursor/AGENTS.md).

**Lệnh slash / multi-agent ECC:** [ECC-COMMANDS.md](./ECC-COMMANDS.md).

## Nguyên tắc ngắn

1. Không commit `.env*`, khóa ví, RPC secrets, credential thật.
2. Module `matching/`, `orders/` cực nhạy — luôn có test và mô tả rủi ro khi đổi luồng khớp lệnh.
3. Biến env mới → cập nhật `src/config/env.validation.ts` (theo README).
4. Trả lời user tiếng Việt khi họ dùng tiếng Việt; thuật ngữ kỹ thuật giữ tiếng Anh chuẩn ngành.
