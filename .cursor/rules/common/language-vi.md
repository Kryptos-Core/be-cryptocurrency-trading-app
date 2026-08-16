# Ngôn ngữ phản hồi — Tiếng Việt có dấu (BE)

> Quy tắc bắt buộc cho mọi AI agent / assistant / sub-agent làm việc trong repo NestJS backend này.
> Bản sao của rule gốc ở workspace root — đặt tại đây để áp dụng khi BE repo được mở độc lập.

## Nguyên tắc chính

Mọi **phản hồi, lập kế hoạch, tài liệu, thông điệp, commit message tiếng Việt, comment mô tả trong tài liệu `.md`, báo cáo review, walk-through kiến trúc NestJS, hướng dẫn onboarding backend, RCA, post-mortem, v.v.** đều **BẮT BUỘC** dùng **tiếng Việt có dấu chuẩn chính tả**.

Áp dụng cho:

- Câu trả lời chat trực tiếp cho user.
- Mọi bản kế hoạch backend (`migration plan`, `outbox rollout`, `matching engine refactor plan`, `wallets hardening plan`, `task_list`, v.v.).
- Mọi tài liệu Markdown trong repo (`README`, `docs/ARCHITECTURE.md`, `docs/security-zones.md`, `CONTRIBUTING-RULES.md`, `VIBE_CODE.md`, runbook, ADR).
- Mô tả PR, commit message body, review note từ `code-reviewer` / `security-reviewer`.
- Output từ sub-agent (`planner`, `tdd-guide`, `build-error-resolver`, `database-reviewer`, `python-reviewer` khi review TypeScript/Python scripts).

## Phạm vi áp dụng

| Áp dụng | Không áp dụng |
|---------|---------------|
| Văn xuôi, giải thích, mô tả, câu hỏi, heading | Source code (identifier, class, function, variable, DTO, entity) |
| Comment giải thích bằng tiếng Việt trong file `.md` | Comment code (giữ tiếng Anh để codebase nhất quán) |
| Bảng biểu, danh sách, mục lục, narrative | Chuỗi log, error message runtime, console output |
| Thông điệp cho user / stakeholder | Tên file, tên thư mục, tên package, env var |
| Câu trả lời từ sub-agent | API name, route name, JSON key, TypeORM column, Kafka topic, queue name |
| Tài liệu kỹ thuật (RFC, ADR, runbook) | SQL query, regex, regex pattern, CLI command |

## Quy tắc cụ thể

1. **Dấu thanh điệu là bắt buộc.** Ví dụ đúng: `lập kế hoạch`, `triển khai`, `kiểm thử`, `phản hồi`, `tài liệu`, `giao diện`, `ràng buộc`, `lỗi`, `cảnh báo`, `mục tiêu`, `đề xuất`, `thay đổi`, `quyết định`, `xử lý`, `mô hình`, `quan hệ`, `lưu lượng`, `giao dịch`, `sổ cái`, `ví`, `khớp lệnh`, `sàn`, `rút tiền`, `nạp tiền`, `lệnh`, `khối`, `xác thực`, `phân quyền`, `giám sát`, `quan sát`, `theo vết`, `truy vết`, `ghi nhật ký`. Không viết không dấu.

2. **Thuật ngữ kỹ thuật giữ nguyên tiếng Anh** — chèn trong câu tiếng Việt khi cần:
   - NestJS / TypeORM / TypeScript / Node.js.
   - `controller`, `service`, `repository`, `module`, `provider`, `guard`, `interceptor`, `middleware`, `pipe`, `decorator`.
   - `outbox`, `CQRS`, `event bus`, `read model`, `Unit of Work` (viết `UoW` theo docs nội bộ nếu phù hợp), `migration`, `seed`, `published_at`, `skip_locked`.
   - `matching engine`, `order book`, `treasury`, `wallet`, `RPC`, `blockchain`, `indexer`, `on-chain`, `off-chain`, `outbox relay`.
   - `Kafka`, `Bull`, `Redis`, `PostgreSQL`, `OpenTelemetry`, `OTel`, `tracing`, `metric`, `span`.
   - `coverage`, `lint`, `formatter`, `Biome`, `tsc --noEmit`, `Jest`, `mock`, `stub`, `fixture`.
   - `commit`, `pull request`, `merge`, `rebase`, `rollback`, `hotfix`, `refactor`, `sprint`, `backlog`.
   - `endpoint`, `DTO`, `entity`, `schema`, `migration`, `seed`, `rollback`, `fixture`.

3. **Khi dịch / diễn giải tài liệu tiếng Anh** sang tiếng Việt, giữ nguyên tên riêng, tên thư viện, version, command. Ví dụ: `NestJS 10` không viết thành `Khung NestJS 10`. Không dịch các thuật ngữ chuẩn ngành đã có trong `docs/ARCHITECTURE.md`.

4. **Số, mã lệnh, đường dẫn, URL, version, port giữ nguyên** dạng gốc — không Việt hóa.

5. **Dấu câu tiếng Việt**: dùng đúng chuẩn. Tránh viết tắt kiểu `ko`, `dc`, `vs`, `j` — thay bằng `không`, `được`, `và`/`so với` trong văn xuôi.

6. **Không trộn ngôn ngữ câu** một cách tùy tiện. Câu tiếng Việt phải có cấu trúc tiếng Việt; chỉ chèn thuật ngữ Anh khi cần thiết.

7. **Thuật ngữ nghiệp vụ crypto/finance** ưu tiên giữ Anh: `order`, `trade`, `fill`, `cancel`, `match`, `ledger`, `balance`, `deposit`, `withdrawal`, `transfer`, `escrow`, `fee`, `spread`, `liquidity`, `slippage`. Nếu phải diễn giải thì ghi Anh trước rồi giải thích tiếng Việt trong ngoặc.

## Khi nào dùng tiếng Anh

- User chủ động yêu cầu phản hồi bằng tiếng Anh (`trả lời bằng tiếng Anh`, `English please`).
- Output là source code, config, schema, migration, query — những thứ không phải văn xuôi.
- Tên file, tên thư mục, identifier, route URL, env var, Kafka topic.
- Khi trích dẫn nguyên văn từ tài liệu / spec / RFC tiếng Anh.

## Kiểm tra nhanh trước khi gửi phản hồi

- [ ] Văn xuôi tiếng Việt có đầy đủ dấu thanh điệu.
- [ ] Thuật ngữ NestJS / crypto / finance đã giữ đúng dạng tiếng Anh phổ biến trong ngành.
- [ ] Không lẫn câu tiếng Anh dài trong đoạn tiếng Việt (trừ khi trích dẫn).
- [ ] Tiêu đề heading đã Việt hóa (nếu là tài liệu hướng dẫn nội bộ).
- [ ] Source code, identifier, route, env var, Kafka topic không bị Việt hóa.
- [ ] Thuật ngữ nghiệp vụ (`matching`, `outbox`, `CQRS`, `read model`, `wallets`, `treasury`) khớp với `docs/ARCHITECTURE.md` và `docs/security-zones.md`.

## Lý do áp dụng

- Người dùng và team backend là người Việt, dấu thanh điệu là chuẩn giao tiếp chính thức.
- Viết không dấu gây mơ hồ nghĩa, khó đọc, giảm chất lượng tài liệu kỹ thuật.
- Duy trì nhất quán ngôn ngữ trong cả hệ thống tài liệu BE (`ARCHITECTURE.md`, `security-zones.md`, `CONTRIBUTING-RULES.md`, `VIBE_CODE.md`, PR body, commit message, review note).
- Thuật ngữ tiếng Anh giữ nguyên giúp tra cứu nhanh, tránh dịch sai kỹ thuật cho các module nhạy cảm (`matching`, `orders`, `treasury`, `wallets`, `blockchain`, `auth`).
