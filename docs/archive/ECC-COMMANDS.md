# ECC — lệnh thông dụng (repo NestJS backend)

Tài liệu tham nhanh cho [Everything Claude Code](https://github.com/affaan-m/everything-claude-code). Phần lớn là **slash command trong Claude Code**; trong **Cursor** dùng `.cursor/commands/` và `.cursor/skills/`.

**Workspace:** mở **thư mục gốc repo này** (cùng cấp với `package.json` Nest) trong Cursor / VS Code / Codex — **không** mở folder monorepo cha. App Flutter là **repo riêng** của team FE.

Xem thêm [CLAUDE.md](.claude/CLAUDE.md), [AGENTS.md](AGENTS.md), [VIBE_CODE.md](VIBE_CODE.md).

**Claude Code CLI + plugin ECC:** **`/ecc:<tên>`** (ví dụ `/ecc:plan`). **Cursor:** `/plan`, `/tdd`, `/build-fix`, … qua `.cursor/commands/`.

---

## Lên kế hoạch & kiến trúc

| Mục đích | Lệnh / gọi ý |
|----------|----------------|
| Blueprint tính năng | **`/ecc:plan`** (CLI); Cursor: **`/plan`** |
| Module / luồng lớn | **`/plan`**, hoặc **architect** / **code-architect** |

---

## Code & chất lượng (TypeScript / NestJS)

| Mục đích | Lệnh / gọi ý |
|----------|----------------|
| TDD | **`/ecc:tdd`** (CLI); Cursor: **`/tdd`** |
| Review sau khi sửa | **`/ecc:code-review`** (CLI); Cursor: **`/code-review`** |
| Build / type / compile | **`/ecc:build-fix`** (CLI); Cursor: **`/build-fix`** |
| Review TS kỹ | Agent **typescript-reviewer** |
| NestJS (module, guard, DI) | Skill **nestjs-patterns** trong `.cursor/skills/` |
| API, DB, cache | **backend-patterns**, **api-design** |
| Migration / schema | **database-migrations** (TypeORM, v.v.) |

---

## Bảo mật & dữ liệu

| Mục đích | Gọi ý |
|----------|--------|
| Rủi ro cấu hình | Skill **security-review** trong prompt |
| Query / schema nặng | **database-reviewer** trong prompt |

---

## Test tự động

| Mục đích | Lệnh |
|----------|------|
| Jest / integration API | `npm test` — theo README |
| E2E API (nếu có) | Cấu hình riêng dự án (không dùng Playwright UI trong repo này) |
| Coverage | Script trong `package.json` |

---

## Dọn code & tài liệu

| Mục đích | Lệnh |
|----------|------|
| Dead code | **`/ecc:refactor-clean`** (CLI); Cursor: **`/refactor-clean`** |
| Docs | **`/ecc:update-docs`** (CLI); Cursor: **`/update-docs`** |

---

## Vòng verify & context

| Mục đích | Lệnh / gọi ý |
|----------|----------------|
| Checkpoint / verify | **`/ecc:checkpoint`**, **`/ecc:verify`** |
| Nén context | **strategic-compact** hoặc `/compact` (Claude Code) |

---

## Multi-model (CCG)

Sau **`npx ccg-workflow`** (xem [CLAUDE.md](.claude/CLAUDE.md)): **`/ecc:multi-plan`**, **`/ecc:multi-backend`**, …

---

## Workflow ngắn (API crypto)

1. **`/plan`** → phạm vi (auth, order, matching, ví, …).  
2. **`/tdd`** khi cần.  
3. **`/build-fix`** khi lỗi compile.  
4. Trước merge nhánh nhạy cảm: **`/code-review`**, **security-review**.  
5. Nest: **nestjs-patterns**; API: **api-design** / **backend-patterns**.

---

## Xem đầy đủ

- **Claude Code:** `/plugin list ecc@ecc`  
- **Cursor:** `.cursor/commands/`, `.cursor/skills/`
