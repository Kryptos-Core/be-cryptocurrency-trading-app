# AI-Assisted Development — NestJS Backend Team

## Triết lý Vibe Code

AI accelerates, human steers. Đặc biệt trong backend crypto trading — mọi code liên quan đến tiền, lệnh, và blockchain **phải được review kỹ trước khi merge**, bất kể AI hay human viết.

## Cursor — AI Inline

### Rules đã có sẵn (NestJS/TypeScript)

- `typescript-patterns.md` — NestJS module/controller/service/repository patterns
- `typescript-testing.md` — Jest + supertest, không có Playwright
- `typescript-security.md` — OWASP API Top 10, JWT, rate limiting
- `nestjs-api-design.md` — Controller design, DTO, response format
- `nestjs-database.md` — TypeORM, migration safety, query optimization
- `nestjs-sensitive-zones.md` — Quy trình đặc biệt cho matching/, orders/, wallets/
- `common-*` — coding style, git workflow, security checklist

### Agents và Commands

```
/ecc:plan          — lập kế hoạch feature trước khi code
/ecc:tdd           — enforce RED→GREEN→REFACTOR
/ecc:security-review — OWASP scan
/ecc:code-review   — code quality review
/ecc:verify        — verification loop sau implement
```

### Workflow cho Feature Mới

```
1. /ecc:plan để tạo implementation plan
2. Viết test trước (/ecc:tdd)
3. Implement service layer
4. Implement controller + DTO
5. npm run lint + npm test
6. /ecc:security-review
7. PR với mô tả rõ test coverage
```

## Claude Code — Deep Analysis

```bash
cd be-cryptocurrency-trading-app
claude

# /ecc:plan "Add PayOS withdrawal webhook"
# /ecc:security-review src/modules/auth/
# /ecc:verify        — check implement có đúng plan không
```

**Khi nào dùng Claude Code:**
- Thiết kế module mới
- Refactoring cross-module
- Security audit trước khi deploy
- Phân tích lỗi phức tạp trong matching engine

## Sensitive Module Protocol

Khi AI đề xuất thay đổi `matching/`, `orders/`, `wallets/`, `treasury/`, `blockchain/`:

1. **Dừng lại** — không implement ngay
2. Đọc `nestjs-sensitive-zones.md`
3. Tạo `docs/risk-<feature>.md` với risk assessment
4. Viết test 100% coverage cho business logic paths
5. Review với Tech Lead trước khi tạo PR

**Không có ngoại lệ cho quy trình này.**

## Quality Gates — Bắt buộc trước PR

```bash
npm run lint           # Biome check
npx tsc --noEmit       # TypeScript
npm test               # Jest
# Kiểm tra coverage report: coverage/lcov-report/index.html
```

CI/CD sẽ chạy lại tất cả — nếu local pass mà CI fail, investigate trước khi re-run.

## Prompt Patterns Hay Dùng

```
"Tạo NestJS module [X] theo patterns trong typescript-patterns.md"
"Viết Jest test cho OrdersService.createOrder theo AAA pattern"
"Review DTO này theo typescript-security.md OWASP A3: [paste code]"
"Tạo migration để thêm column [X] vào bảng [Y] an toàn (backward compatible)"
"Phân tích race condition potential trong: [paste code]"
```

## Không Làm

- Sửa `matching/` hay `orders/` mà không có risk assessment
- Thêm biến env mới mà không update `src/config/env.validation.ts`
- Xóa migration đã chạy
- Dùng `console.log` trong production code (dùng NestJS Logger)
- Bỏ `@UseGuards(JwtAuthGuard)` khỏi endpoint private
- Merge vào main trước 9am hoặc sau 5pm với sensitive module changes
