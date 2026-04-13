---
name: "clean-code-solid-oop-naming"
description: "SOLID, OOP, quy tắc đặt tên (mọi loại identifier), Clean Code & Clean Architecture nghiêm ngặt"
applyTo: "**/*.{ts,js,tsx,jsx,dart,mjs,cjs,json,yml,yaml,md}"
---

# SOLID, OOP, đặt tên & Clean Code / Architecture

**Nguồn chuẩn** cho SOLID, OOP, naming, boundary layer trong repo (persona chỉ trỏ tới file này — tránh trùng context).

Áp dụng khi viết hoặc review code. Thuật ngữ kỹ thuật giữ tiếng Anh; giải thích ngắn bằng tiếng Việt khi cần.

## SOLID

- **S — Single Responsibility**: một class/module/function chỉ một lý do để đổi. Nếu vừa parse HTTP vừa ghi DB trong cùng hàm → tách.
- **O — Open/Closed**: mở rộng hành vi bằng interface/strategy/plugin; tránh sửa lõi đã ổn định cho từng case mới (if/switch phình vô hạn).
- **L — Liskov Substitution**: subtype phải thay thế base type mà không phá contract (không ném exception “lạ”, không siết chặt precondition, không làm no-op ngầm phá semantics).
- **I — Interface Segregation**: nhiều interface nhỏ, client chỉ phụ thuộc phần dùng; tránh “god interface” bắt implement stub/throw.
- **D — Dependency Inversion**: module cấp cao phụ thuộc abstraction; chi tiết (DB, HTTP, queue) implement abstraction; wiring ở composition root / DI.

**Smell cần sửa**: God object, duplicate logic vì không abstraction, subclass chỉ để reuse code nhưng vi phạm LSP, import concrete infra vào domain.

## OOP (thực dụng, không dogma)

- **Encapsulation**: invariant của aggregate/object nằm trong type; tránh “anemic” khi logic nghiệp vụ phức tạp; public API nhỏ, field private/protected có chủ đích.
- **Composition over inheritance**: ưu tiên has-a; inheritance chỉ khi “is-a” thật sự và hierarchy ổn định.
- **Polymorphism**: thay if theo type bằng strategy/handler map khi số loại tăng hoặc rule thay đổi thường xuyên.
- **Abstraction**: boundary rõ (domain vs application vs infrastructure); không leak ORM/HTTP chi tiết ra ngoài layer.

## Đặt tên — nguyên tắc chung

- **Reveal intent**: tên trả lời “tại sao / làm gì”, không “cách lưu trữ” trừ khi đó là contract (ví dụ `userId` OK, `string1` không).
- **Một khái niệm — một từ**; tránh từ đồng nghĩa cho cùng ý (`fetch` vs `get` vs `load` lung tung cho cùng layer).
- **Tránh noise**: không `data`, `info`, `manager`, `handler` vô nghĩa nếu không bổ sung ngữ nghĩa; không tiền tố/hậu tố thừa (`userObject`, `listArray`).
- **Độ dài tỷ lệ với scope**: biến sống ngắn có thể ngắn (`i`, `err` trong vòng lặp nhỏ); symbol public/module-level phải đủ rõ.
- **Nhất quán ngôn ngữ**: codebase tiếng Anh thì toàn bộ identifier tiếng Anh; không trộn `getUser` với `layDonHang`.

## Đặt tên theo loại

| Loại | Quy ước | Ví dụ |
|------|---------|--------|
| Biến / field | `camelCase` (TS/JS); danh từ/cụm danh từ | `activeSubscription`, `retryCount` |
| Hằng (thật sự cố định) | `SCREAMING_SNAKE` hoặc theo style dự án nhất quán | `MAX_BATCH_SIZE`, `DEFAULT_TIMEOUT_MS` |
| Boolean | tiền tố `is` / `has` / `should` / `can` | `isEnabled`, `hasExpired`, `shouldRetry` |
| Hàm / method | động từ/cụm động từ; không che giấu side effect | `calculateTotal`, `persistOrder` (nếu ghi DB) |
| Predicate thuần | có thể `is*` / `has*` nếu trả về boolean rõ | `isValidEmail(email)` |
| Class / type / interface | `PascalCase`; interface không bắt buộc tiền tố `I` trừ convention repo | `OrderService`, `PaymentGateway` |
| Generic | một chữ có ý nghĩa hoặc `TItem`, `TKey` | tránh `T` mơ hồ khi nhiều type param |
| Enum / union labels | `PascalCase` enum; members `SCREAMING` hoặc `camelCase` theo một chuẩn cả repo | thống nhất một kiểu |
| React component | `PascalCase`, tên = UI intent | `UserProfileCard` |
| Hook | `use` + `PascalCase` phần sau | `useOrderForm` |
| Event / message | past tense hoặc domain event rõ | `OrderPlaced`, `PaymentCaptured` |
| DTO / API response (type) | suffix `Dto` / `Response` / `Request` theo convention repo | `CreateUserRequest`, `UserDto` |
| Test file | `*.spec.ts` / `*.test.ts` khớp file gốc hoặc folder `__tests__` thống nhất | `order.service.spec.ts` |
| DB table / column | `snake_case` phổ biến SQL; khớp migration | `order_items`, `created_at` |
| File (TS/JS) | `kebab-case` hoặc `camelCase` theo repo — **chọn một**; module export rõ | `order-service.ts`, `template-form.repository.ts` |
| Folder / package | lowercase, ngắn, theo bounded context hoặc layer | `modules/orders`, `infra/email` |
| Route path | `kebab-case`, danh từ số nhiều REST | `/api/v1/order-items` |
| Env var | `SCREAMING_SNAKE`, scope prefix | `DATABASE_URL`, `FEATURE_X_ENABLED` |
| Config key | `camelCase` hoặc `snake_case` thống nhất trong file config | một file một convention |

## Hàm & module

- **Một mức abstraction mỗi hàm**: không trộn “low-level byte” với “high-level orchestration” trong cùng block dài.
- **Số tham số hợp lý**: trên ~3–4 tham số → options object hoặc DTO (có type).
- **Tên phản ánh side effect**: `load*` đọc, `save*` / `persist*` ghi, `validate*` không ghi DB trừ khi tên nói rõ.
- **Pure vs effect**: tách; không đặt tên `get*` cho hàm vừa mutate vừa return.

## Clean Code (khắc khe)

- **Không dead code / comment chết**; comment giải thích “tại sao”, không lặp lại code.
- **Lỗi**: fail fast; không nuốt exception; error message có ngữ cảnh (id, operation), không PII nhạy cảm trong log.
- **Điều kiện**: tránh lồng sâu; early return; trích `isXxx` có tên.
- **Số magic**: hằng có tên hoặc enum.
- **Trùng lặp**: DRY có chừng — không abstract khi chỉ trùng tình cờ; **rule of three** / ngưỡng team.

## Clean Architecture & boundaries

- **Dependency rule**: source dependencies chỉ hướng vào trong (domain ← application ← adapters). Framework/DB/UI là chi tiết thay thế được.
- **Use case rõ**: orchestration ở application layer; domain rules không phụ thuộc HTTP/ORM.
- **DTO tại biên**: không rò rỉ entity persistence ra API nếu không có chủ đích contract.
- **Test**: domain và use case test được không cần network/DB (hoặc contract test tách biệt).

## Anti-patterns tên & cấu trúc (tránh)

- Tên viết tắt mơ hồ (`usrMgr`, `tmp`).
- Số trong tên trừ khi cố định có nghĩa (`ipv4`, `sha256` OK; `user2` không).
- File/class không khớp trách nhiệm (tên `utils` chứa business).
- “Boolean” dạng string không rõ (`status` thay vì `isPublished` khi thật sự boolean).

Khi convention trong repo (ví dụ `t1/`) mâu thuẫn file này, **ưu tiên convention đã merge trong dự án**, rồi mở PR chỉnh convention nếu cần thống nhất.
