# Vibe Code — NestJS backend

`VIBE_CODE.md` là chuẩn AI-assisted development của team BE. Tài liệu này là nguồn luật trung tâm cho Cursor, Claude Code và Codex CLI trong repo backend này.

## Workspace policy

- Chỉ mở **repo backend này** làm workspace, cùng cấp với `package.json`, `src/`, `.cursor/`.
- Không mở parent monorepo như một codebase chung.
- Nếu task liên quan FE, tách thành task riêng và chuyển sang repo Flutter.

## Source of truth

- `README.md` — setup, scripts, module map
- `docs/ARCHITECTURE.md` — kiến trúc và ranh giới module
- `docs/security-zones.md` — vùng nhạy cảm phải đọc trước khi sửa
- `CONTRIBUTING-RULES.md` — conventions + PR process
- `.cursor/rules/` — rules Cursor theo ngữ cảnh
- `.cursor/AGENTS.md` — hướng dẫn Cursor
- `.claude/CLAUDE.md` — ngữ cảnh Claude Code
- `.codex/AGENTS.md` — ngữ cảnh Codex CLI
- `.agents/skills/` — skill Codex CLI

## Stack boundary

- NestJS / TypeScript only.
- Không thêm Flutter/Dart, React/Next, hay Playwright UI vào repo này.
- API contract thay đổi phải được version hóa và báo cho team FE qua tài liệu hoặc OpenAPI.

## Skill allowlist

Ưu tiên các skill phục vụ backend:

- `nestjs-patterns`
- `backend-patterns`
- `api-design`
- `database-reviewer`
- `security-review`
- `tdd-workflow`
- `verification-loop`
- `documentation-lookup`
- `code-tour`

Nếu một skill không phục vụ NestJS/backend thì không load mặc định.

## Architecture and SOLID

- Controller chỉ làm transport, service giữ business logic, repository che persistence.
- Module map theo bounded context.
- DTO validate mọi input, response shape rõ ràng.
- Domain và application layer không phụ thuộc vào UI hoặc framework ngoài ranh giới.
- Ưu tiên object bất biến và các thay đổi có kiểm soát tại edge.
- Giữ side effects ở infrastructure boundary.

## Sensitive zones

Các vùng này cần đọc tài liệu liên quan trước khi sửa:

- `orders/`
- `matching/`
- `wallets/`
- `treasury/`
- `blockchain/`

Khi chạm các vùng này:

- viết risk note nếu thay đổi logic tài chính hoặc khóa ví
- tăng mức test cho business logic path
- yêu cầu review cẩn thận hơn trước khi merge

## Quality gates

Trước khi coi xong:

- `npm run lint` hoặc `npx biome check src/`
- `npx tsc --noEmit`
- `npm test`
- coverage tối thiểu 80%

Mỗi endpoint mới nên có DTO, validator, và test phù hợp ở service / controller / integration layer.

## Security rules

- Không commit `.env`, khóa ví, RPC secrets, seed credentials hay private key thật.
- Biến env mới phải được thêm vào `src/config/env.validation.ts`.
- Không tạo role lạ ngoài `src/common/enums`.
- Redis lock phải atomic, không dùng pattern dễ race condition.
- Không dùng `console.log` trong production code.

## What not to do

- Không thêm code Flutter/Dart vào repo này.
- Không trộn thay đổi BE/FE trong cùng một task.
- Không xóa migration đã chạy hoặc sửa migration không có backfill rõ ràng.

## Optional upstream

Repo upstream ECC vẫn có thể dùng để đồng bộ máy cá nhân, nhưng không phải workflow mặc định của team. Ngày thường chỉ làm việc trong repo backend này.
