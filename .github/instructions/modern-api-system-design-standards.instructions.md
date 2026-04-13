---
name: "modern-api-system-design-standards"
description: "Nguyên tắc & tiêu chuẩn thiết kế hệ thống API hiện đại — HTTP semantics, contract-first, 7 nguyên tắc, REST/GraphQL/gRPC/async, bảo mật, observability, versioning, checklist"
applyTo: "**/*.{ts,tsx,js,mjs,cjs,json,yml,yaml,md}"
---

# Nguyên tắc và tiêu chuẩn thiết kế hệ thống API hiện đại

Áp dụng khi thiết kế/review API (HTTP, message-driven, gRPC), biên hệ thống, contract và vận hành. **Thuật ngữ kỹ thuật** giữ tiếng Anh khi cần độ chính xác.

**Thống nhất với repo**: Chi tiết REST cụ thể dự án, pagination, performance DB — tham chiếu `api-design-architecture-patterns.mdc`, `pagination-best-practices.mdc`, `backend-data-performance.mdc`; kiến trúc tổng thể — `system-design-senior.mdc`.

---

## Tóm tắt điều hành

Thiết kế API là **contract** ở ranh giới: dữ liệu, hành vi, lỗi, bảo mật, quan sát, vòng đời, tuân thủ. API tốt **tiến hoá được** mà không phá client, **vận hành được** (trace/id lỗi), **an toàn** (authn/z, chống lạm dụng). Ưu tiên **chuẩn có đặc tả** để tăng interoperability và giảm chi phí tích hợp.

### Khuyến nghị “ít rủi ro” (mặc định)

- **HTTP semantics đúng chuẩn**: methods, idempotency, caching, status codes — tránh dùng HTTP chỉ như tunnel nếu mục tiêu là API công khai / dễ tích hợp.
- **Contract-first**: OpenAPI (HTTP), AsyncAPI (event/message), Protobuf (gRPC / binary message); đưa vào CI — kiểm tra tương thích, sinh SDK/mocks.
- **Chuẩn hoá lỗi HTTP**: [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) — `application/problem+json`; gRPC: status codes + rich error details khi cần.
- **Bảo mật mặc định**: OAuth 2.0 + PKCE, BCP OAuth; JWT chỉ khi hiểu trade-off (revoke, rotation, audience); mTLS khi cần định danh máy–máy mạnh; TLS hiện đại; quản trị secrets chuẩn.
- **Observability**: W3C Trace Context; instrument theo OpenTelemetry (metrics/logs/traces nhất quán).
- **Vòng đời**: versioning/deprecation rõ; dữ liệu cá nhân — tối thiểu hoá, privacy/security by design; cân nhắc GDPR / data residency khi xuyên biên giới.

---

## Bảy nguyên tắc cốt lõi

| Nguyên tắc | Ý chính | Thực hành | Trade-off |
|------------|---------|-----------|-----------|
| **Simplicity** | Giảm quy ước “riêng”; dùng chuẩn (HTTP, media types, schema) | Resource model rõ (REST); verb HTTP đúng nghĩa; JSON + `application/problem+json` cho lỗi | Đơn giản có thì hạn chế tối ưu cục bộ; có thể thêm round-trip |
| **Consistency** | Cùng pattern naming, pagination, filter, lỗi, auth | Style guide nội bộ; lint/review; correlation ID, error envelope, một model phân trang | Quá cứng → giảm linh hoạt; cần exception process có kiểm soát |
| **Discoverability** | Máy/người tự khám phá endpoint, schema, auth, rate limit | OpenAPI/AsyncAPI là source of truth; portal + CI đồng bộ; GraphQL — introspection có kiểm soát theo môi trường | Càng discoverable càng dễ enumeration — cần authz, rate limit, logging |
| **Idempotency** | Gọi lặp an toàn | PUT/DELETE + safe methods theo RFC; POST/PATCH — `Idempotency-Key` (draft IETF) + lưu fingerprint/response; ETag/`If-Match` | State + TTL cho idempotency; chi phí lưu trữ / vận hành |
| **Performance** | Round-trip, payload, cache, streaming | REST: `Cache-Control`, ETag/`If-None-Match`; gRPC: HTTP/2 + protobuf; GraphQL: depth/complexity, batching, resolver caching | Cache mạnh → stale; streaming → timeout/cancel/backpressure |
| **Scalability** | Stateless, cache, tách tầng, giảm coupling | API stateless; pagination/cursor; event-driven — broker, envelope (ví dụ CloudEvents) | Stateless đẩy phức tạp sang client/store; event — ordering, exactly-once khó |
| **Observability** | Trả lời: request đi đâu, chậm đâu, lỗi gì | Trace propagation end-to-end; semantic conventions; structured log; tránh PII trong log/span | Telemetry chi tiết → chi phí & privacy — sampling, redaction |

**Ví dụ nhanh**: `POST /orders` thay vì `POST /orders/create`; list dùng cursor/`nextPageToken` thống nhất; mọi 4xx/5xx HTTP dùng Problem Details.

---

## Phong cách kiến trúc — chọn theo bề mặt tích hợp

| Thuộc tính | REST (HTTP resource) | GraphQL | gRPC | Async / event-driven |
|------------|----------------------|---------|------|----------------------|
| Tương tác | Resource + HTTP verbs | Query/mutation trên graph | RPC service/method | Publish/consume async |
| Transport | HTTP/1.1–3 | Thường HTTP | HTTP/2 | Broker (Kafka, AMQP, …), có thể HTTP |
| Payload | JSON phổ biến | JSON theo query | Protobuf | JSON/Avro/Protobuf + envelope |
| Caching “tự nhiên” | Mạnh nếu dùng HTTP cache đúng | Cần lớp app/cache | Chủ yếu app-level | Theo broker + consumer/view |
| Contract | OpenAPI | Schema + introspection | `.proto` | AsyncAPI; CloudEvents cho domain events |
| Coupling | Vừa | Có thể tăng qua resolver | Chặt (IDL) | Loose (topic + schema) |
| Use case tiêu biểu | Public API, CRUD | Aggregation, client linh hoạt | Nội bộ, latency, streaming | Decoupling domain, workflow async |
| Ops | Thấp–trung | Trung–cao (query control) | Trung (proto evolution, LB HTTP/2) | Cao (ordering, DLQ, trace) |

**Nguyên tắc chọn**: không “cái nào tốt nhất” — chọn theo public vs internal, hình dạng dữ liệu, caching/streaming, và cách evolve schema.

---

## Hợp đồng và mô tả

- **OpenAPI**: source of truth cho docs, SDK, mock, contract test CI; OAS 3.1 + JSON Schema giảm lệch schema/runtime.
- **AsyncAPI**: channels/topics, message schema, publish/subscribe, security; version spec theo dự án.
- **Protobuf / proto3**: không đổi/reuse field numbers; `reserved` khi xoá field; thay đổi additive; package/version cho breaking khi cần.

---

## Phiên bản và tương thích

- **Compatibility policy**: nêu rõ cái gì được phép không bump major (thêm field optional, thêm endpoint) vs breaking (đổi semantics, xoá field, đổi default có ảnh hưởng client).
- **REST public**: `/v1/...` hoặc subdomain; header versioning chỉ khi có tooling/infra rõ.
- **gRPC/proto**: version qua package/namespace + quy tắc tiến hoá.
- **Events**: version trong schema / topic naming; ưu tiên consumer forward-compatible.
- **CI**: diff OpenAPI/AsyncAPI/proto + compatibility tests.

**GraphQL**: thường “versionless” — deprecation + additive changes + policy sunset field.

---

## Lỗi và mã trạng thái

- **HTTP** ([RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)): `200` OK; `201` Created + `Location` khi phù hợp; `202` async; `204` no body; 4xx/5xx đúng semantics (`401` vs `403`, `404`, `409`, `429` + `Retry-After`). Tránh `200` + lỗi trong body cho API mới (legacy thì document và có lộ trình).
- **Problem Details** ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)): `type`, `title`, `status`, `detail`, `instance`; `type` ổn định (URI/registry); có thể thêm business `code` ở lớp app — không lộ thông tin nhạy cảm.
- **gRPC**: dùng status codes đúng nghĩa; rich errors qua details/metadata khi cần.

---

## Xác thực, phân quyền, bảo mật API

- **OAuth 2.0**: Authorization Code; public clients — PKCE ([RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)); bearer token qua TLS ([RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html)); BCP [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html); native apps — [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252).
- **JWT** ([RFC 7519](https://www.rfc-editor.org/rfc/rfc7519.html)): nếu dùng access token — [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html) (validate `iss`/`aud`/`exp`/algorithm, rotation JWKs); cân nhắc opaque token khi cần revoke tức thì.
- **mTLS** / **OAuth mTLS** ([RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705)): machine-to-machine, strong client identity.
- **API keys**: chỉ khi use case đơn giản; coi như secret; least privilege, rotation, audit — không thay OAuth cho phân quyền phức tạp.
- **Controls**: rate limit → `429` + `Retry-After` / RateLimit headers (draft IETF nếu dùng); validate input sớm (schema, size limit); CORS default deny, allowlist origin; TLS 1.3 + BCP; HSTS khi browser-facing phù hợp; secrets qua secret manager — không hardcode.

---

## Vận hành, DX, governance, tuân thủ

- **CI/CD**: lint/validate spec; codegen stubs/clients; contract tests; breaking change detection; mock/sandbox.
- **Security testing**: OWASP API Security Top 10; negative/fuzz tuỳ môi trường.
- **Observability**: trace context end-to-end; OTel semantic conventions; sampling/redaction.
- **DX**: portal (docs, examples, changelog, deprecation); SDK generate + test trong CI.
- **Governance**: design review (naming, semantics, errors, authz, observability, compatibility); deprecation/sunset có lịch; API inventory (owner, consumer, SLA, data classification).
- **GDPR / PII** (khi áp dụng): minimization; security of processing; residency/transfers hợp lệ; retention/redaction cho log/trace.

---

## Sơ đồ tham chiếu (Mermaid)

**Kiến trúc tổng quát**:

```mermaid
flowchart LR
  Client[Client / Partner / App] -->|HTTP| Gateway[API Gateway]
  Gateway --> Auth[Authorization Server]
  Gateway --> SvcA[Service A]
  Gateway --> SvcB[Service B]
  SvcA --> DB[(Database)]
  SvcB --> DB2[(Database)]
  SvcA -->|publish| Bus[(Event Broker)]
  Bus -->|consume| Worker[Async Consumer]
  Worker --> DB2
  Gateway --> OTel[OTel Collector]
  SvcA --> OTel
  SvcB --> OTel
  Worker --> OTel
```

**OAuth 2.0 + PKCE (tóm tắt)**:

```mermaid
sequenceDiagram
  participant U as User Agent
  participant C as Client App
  participant AS as Authorization Server
  participant API as Resource Server
  C->>AS: Authorization request (code + PKCE challenge)
  AS->>U: Login + consent
  U->>AS: Authenticate + approve
  AS-->>C: Redirect with authorization code
  C->>AS: Token request (code + PKCE verifier)
  AS-->>C: Access token
  C->>API: Request with Bearer token
  API-->>C: Response
```

---

## Checklist thiết kế API mới

**Mục tiêu & phạm vi**

- [ ] Consumer (public / internal / partner), use cases, SLO/SLA dự kiến
- [ ] Data classification (PII/PHI/PCI…), retention, data residency

**Kiến trúc & contract**

- [ ] Chọn REST / GraphQL / gRPC / async phù hợp bề mặt và evolution
- [ ] OpenAPI / AsyncAPI / proto là source of truth; có examples và error schema
- [ ] Quy tắc compatibility (proto: không reuse tags; additive; deprecate trước khi remove)

**Semantics & lỗi**

- [ ] HTTP methods/status đúng semantics; cache headers khi phù hợp
- [ ] Lỗi HTTP: RFC 9457 (`application/problem+json`)
- [ ] gRPC: status + mapping nhất quán với HTTP gateway nếu có

**Idempotency & concurrency**

- [ ] PUT/DELETE/safe methods idempotent; POST/PATCH: `Idempotency-Key` khi cần
- [ ] Optimistic concurrency (ETag/`If-Match`) khi cập nhật có xung đột

**Authn / Authz**

- [ ] OAuth 2.0 + PKCE theo BCP; scopes/permissions rõ
- [ ] JWT theo RFC 8725 nếu dùng; mTLS khi cần

**Security controls**

- [ ] Rate limit + 429 + `Retry-After`
- [ ] Input validation, giới hạn payload
- [ ] CORS tối thiểu cần thiết
- [ ] Secrets management

**Testing & release**

- [ ] CI: validate spec, compatibility, contract tests
- [ ] Mock/sandbox cho dev & integration

**Observability**

- [ ] Trace propagation; OTel; semantic conventions

**Lifecycle**

- [ ] Versioning / deprecation / sunset; ownership; changelog

---

## Nguồn đặc tả tham chiếu (rút gọn)

- HTTP: [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html) (caching), [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113.html) (HTTP/2)
- Lỗi: [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), [IANA problem+json](https://www.iana.org/assignments/media-types/application/problem%2Bjson)
- OpenAPI: [OAS 3.1](https://spec.openapis.org/oas/v3.1.0.html); AsyncAPI: [asyncapi.com](https://www.asyncapi.com/docs/reference/specification/latest); gRPC/Protobuf: [grpc.io](https://grpc.io/docs/), [protobuf.dev](https://protobuf.dev/programming-guides/proto3/)
- Trace / OTel: [W3C Trace Context](https://www.w3.org/TR/trace-context/), [OpenTelemetry](https://opentelemetry.io/docs/specs/otel/)
- Versioning / tương thích: [Google AIP-185](https://google.aip.dev/185), [AIP-180](https://google.aip.dev/180)
- REST thực hành: [Microsoft API design](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design), [Zalando REST guidelines](https://opensource.zalando.com/restful-api-guidelines/)
- REST lý thuyết: [Fielding dissertation](https://roy.gbiv.com/pubs/dissertation/fielding_dissertation.pdf)
- Bảo mật: [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/)
- Idempotency-Key: [IETF draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
- CloudEvents: [spec](https://github.com/cloudevents/spec)

Nội dung rule này được tổng hợp từ tài liệu *Nguyên tắc và tiêu chuẩn thiết kế hệ thống API hiện đại* (workspace) để dùng làm ngữ cảnh cố định trong Cursor.