# API v2 Documentation

Base URL: `https://vilao.ai`

## Authentication

1. Tạo Personal Access Token (PAT) tại trang **Tài khoản** trong console
2. Mỗi user chỉ có **1 token duy nhất** với **full quyền truy cập**
3. Token có dạng `pat-xxxxxxxx...` và chỉ hiện 1 lần khi tạo
4. Thêm header `Authorization: Bearer pat-xxx...` vào mọi request

Header: `Authorization: Bearer pat-your-token`

### Scopes

| Scope | Description |
|-------|-------------|
| `containers:read` | Xem danh sách, chi tiết, logs của GPU containers |
| `containers:write` | Tạo, start, stop, restart, delete containers |
| `vms:read` | Xem danh sách, chi tiết VMs |
| `vms:write` | Tạo, start, stop, reboot, delete VMs |
| `llm:read` | Xem LLM keys, subscriptions, marketplace, usage |
| `llm:write` | Tạo/xóa LLM keys, subscribe/unsubscribe models |
| `account:read` | Xem thông tin tài khoản, số dư |
| `wallet:read` | Xem trạng thái giao dịch nạp tiền, lịch sử giao dịch |
| `wallet:write` | Tạo yêu cầu nạp tiền QR |

### Error Format

```json
{
  "success": false,
  "error": {
    "code": "auth/invalid-token",
    "message": "Invalid token",
    "hint": "Check that your token is active and not expired"
  }
}
```

### Rate Limiting

Rate limit áp dụng per-token, default 120 req/phút. Khi vượt giới hạn: HTTP 429 Too Many Requests.

---

## Account

Lấy thông tin tài khoản, số dư

### `GET /api/v2/account/me`

Lấy thông tin tài khoản

**Scope:** `account:read`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "id": "user-id",
    "username": "demo",
    "email": "demo@example.com",
    "role": "user",
    "balance": 100000,
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

### `GET /api/v2/account/balance`

Lấy số dư tài khoản

**Scope:** `account:read`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "balance": 100000,
    "withdrawable_balance": 50000,
    "used_balance": 50000
  }
}
```

## Wallet / Payments

Nạp tiền qua QR chuyển khoản ngân hàng, theo dõi trạng thái giao dịch

### `POST /api/v2/wallet/topup`

Tạo yêu cầu nạp tiền (QR)

Tạo một giao dịch nạp tiền mới. Trả về mã QR chuyển khoản ngân hàng (SePay). User quét QR để chuyển khoản, hệ thống tự động xác nhận qua webhook. Giao dịch hết hạn sau **30 phút** nếu chưa thanh toán.

**Scope:** `wallet:write`

**Request Body:**

```json
{
  "amount": 100000
}
```

**Response Example:**

```json
{
  "data": {
    "transaction_id": "SEVQR661f1a2b3c4d5e6f7a8b9c",
    "status": "pending",
    "amount": 100000,
    "currency": "VND",
    "qr_image_url": "https://qr.sepay.vn/img?acc=123456789&bank=Vietcombank&amount=100000&des=SEVQR661f...",
    "transfer_content": "SEVQR661f1a2b3c4d5e6f7a8b9c",
    "account_number": "123456789",
    "bank_name": "Vietcombank",
    "expires_at": "2026-04-12T10:30:00Z"
  },
  "request_id": "uuid"
}
```

### `GET /api/v2/wallet/topup/:id`

Lấy trạng thái giao dịch nạp tiền

Kiểm tra trạng thái giao dịch nạp tiền. Dùng để polling cho đến khi `status` chuyển sang `paid` hoặc `expired`. Nếu giao dịch vẫn `pending`, response bao gồm lại QR và thông tin chuyển khoản.

**Scope:** `wallet:read`

**Response Example:**

```json
{
  "data": {
    "transaction_id": "SEVQR661f1a2b3c4d5e6f7a8b9c",
    "status": "paid",
    "amount_expected": 100000,
    "amount_paid": 100000,
    "currency": "VND",
    "created_at": "2026-04-12T10:00:00Z",
    "expires_at": "2026-04-12T10:30:00Z",
    "paid_at": "2026-04-12T10:05:23Z"
  },
  "request_id": "uuid"
}
```

### `GET /api/v2/wallet/transactions`

Lịch sử giao dịch nạp tiền

Danh sách tất cả giao dịch nạp tiền của user, phân trang. Có thể lọc theo `status`: `pending`, `paid`, `expired`, `failed`, `need_review`.

**Scope:** `wallet:read`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `page` | number | Trang (mặc định 1) |
| `page_size` | number | Số lượng/trang (mặc định 20, max 100) |
| `status` | string | Lọc theo trạng thái: pending, paid, expired, failed, need_review |

**Response Example:**

```json
{
  "data": [
    {
      "id": "SEVQR661f1a2b3c4d5e6f7a8b9c",
      "status": "paid",
      "amount_expected": 100000,
      "amount_paid": 100000,
      "currency": "VND",
      "created_at": "2026-04-12T10:00:00Z",
      "paid_at": "2026-04-12T10:05:23Z"
    },
    {
      "id": "SEVQR662a1b2c3d4e5f6a7b8c9d",
      "status": "expired",
      "amount_expected": 50000,
      "amount_paid": 0,
      "currency": "VND",
      "created_at": "2026-04-11T08:00:00Z"
    }
  ],
  "total_count": 2,
  "request_id": "uuid"
}
```

## GPU Containers

Thuê, quản lý và monitor máy GPU

### `GET /api/v2/containers`

Danh sách containers

**Scope:** `containers:read`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `page` | number | Trang (mặc định 1) |
| `page_size` | number | Số lượng/trang (mặc định 20, max 100) |
| `status` | string | Lọc theo trạng thái: running, stopped, creating, error |

**Response Example:**

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "page_size": 20
  }
}
```

### `GET /api/v2/containers/:id`

Chi tiết container

**Scope:** `containers:read`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "id": "container-id",
    "name": "my-gpu-container",
    "status": "running",
    "image": "nvidia/cuda:12.0-runtime-ubuntu22.04",
    "resources": {
      "gpu_count": 1,
      "cpu_cores": 4,
      "memory_mb": 8192
    }
  }
}
```

### `POST /api/v2/containers`

Tạo container mới

**Scope:** `containers:write`

**Request Body:**

```json
{
  "agent_id": "agent-uuid",
  "name": "my-container",
  "image": "nvidia/cuda:12.0-runtime-ubuntu22.04",
  "resources": {
    "gpu_count": 1,
    "cpu_cores": 4,
    "memory_mb": 8192,
    "storage_gb": 50
  },
  "networking": {
    "ssh_public_key": "ssh-rsa AAAA...",
    "exposed_ports": [
      {
        "container_port": 8080,
        "protocol": "tcp",
        "name": "web"
      }
    ]
  }
}
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "id": "new-container-id",
    "status": "creating"
  }
}
```

### `POST /api/v2/containers/:id/stop`

Dừng container

**Scope:** `containers:write`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "status": "stopped"
  }
}
```

### `POST /api/v2/containers/:id/start`

Khởi động container

**Scope:** `containers:write`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "status": "running"
  }
}
```

### `POST /api/v2/containers/:id/restart`

Khởi động lại container

**Scope:** `containers:write`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "status": "running"
  }
}
```

### `DELETE /api/v2/containers/:id`

Xóa container

**Scope:** `containers:write`

**Response Example:**

```json
{
  "success": true
}
```

### `GET /api/v2/containers/:id/logs`

Xem logs container

**Scope:** `containers:read`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tail` | number | Số dòng cuối (mặc định 100) |

**Response Example:**

```json
{
  "success": true,
  "data": {
    "logs": "..."
  }
}
```

### `POST /api/v2/containers/:id/ports`

Mở port

**Scope:** `containers:write`

**Request Body:**

```json
{
  "container_ports": [
    8080,
    3000
  ],
  "protocol": "tcp"
}
```

**Response Example:**

```json
{
  "success": true
}
```

## Virtual Machines

Thuê, quản lý VPS

### `GET /api/v2/vms/templates`

Danh sách VM templates

**Scope:** `vms:read`

**Response Example:**

```json
{
  "success": true,
  "data": []
}
```

### `GET /api/v2/vms`

Danh sách VMs

**Scope:** `vms:read`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `page` | number | Trang |
| `page_size` | number | Số lượng/trang |
| `status` | string | Lọc theo trạng thái |

**Response Example:**

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "page_size": 20
  }
}
```

### `GET /api/v2/vms/:id`

Chi tiết VM

**Scope:** `vms:read`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "id": "vm-id",
    "status": "running"
  }
}
```

### `POST /api/v2/vms`

Tạo VM mới

**Scope:** `vms:write`

**Request Body:**

```json
{
  "agent_id": "agent-uuid",
  "template_id": "template-uuid",
  "name": "my-vm",
  "ssh_public_key": "ssh-rsa AAAA..."
}
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "id": "new-vm-id",
    "status": "creating"
  }
}
```

### `POST /api/v2/vms/:id/start`

Khởi động VM

**Scope:** `vms:write`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "status": "running"
  }
}
```

### `POST /api/v2/vms/:id/stop`

Dừng VM

**Scope:** `vms:write`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "status": "stopped"
  }
}
```

### `POST /api/v2/vms/:id/reboot`

Khởi động lại VM

**Scope:** `vms:write`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "status": "running"
  }
}
```

### `DELETE /api/v2/vms/:id`

Xóa VM

**Scope:** `vms:write`

**Response Example:**

```json
{
  "success": true
}
```

## LLM API Keys

Quản lý LLM consumer keys, subscriptions, usage

### `GET /api/v2/llm/keys`

Danh sách API keys

**Scope:** `llm:read`

**Response Example:**

```json
{
  "success": true,
  "data": []
}
```

### `GET /api/v2/llm/keys/:id`

Chi tiết API key

**Scope:** `llm:read`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "id": "key-id",
    "name": "My Key"
  }
}
```

### `POST /api/v2/llm/keys`

Tạo API key mới

**Scope:** `llm:write`

**Request Body:**

```json
{
  "name": "My LLM Key"
}
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "key": {
      "id": "key-id"
    },
    "raw_key": "sk-xxx..."
  }
}
```

### `DELETE /api/v2/llm/keys/:id`

Thu hồi API key

**Scope:** `llm:write`

**Response Example:**

```json
{
  "success": true
}
```

### `GET /api/v2/llm/keys/:id/subscriptions`

Danh sách subscriptions của key

**Scope:** `llm:read`

**Response Example:**

```json
{
  "success": true,
  "data": []
}
```

### `POST /api/v2/llm/keys/:id/subscriptions`

Subscribe model cho key

**Scope:** `llm:write`

**Request Body:**

```json
{
  "provider_id": "provider-uuid",
  "model_id": "model-id",
  "alias": "my-alias"
}
```

**Response Example:**

```json
{
  "success": true
}
```

### `DELETE /api/v2/llm/keys/:id/subscriptions/:sub_id`

Unsubscribe model

**Scope:** `llm:write`

**Response Example:**

```json
{
  "success": true
}
```

### `GET /api/v2/llm/marketplace/models`

Danh sách models marketplace

**Scope:** `llm:read`

**Response Example:**

```json
{
  "success": true,
  "data": []
}
```

### `GET /api/v2/llm/usage`

Lịch sử sử dụng LLM

**Scope:** `llm:read`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `page` | number | Trang |
| `page_size` | number | Số lượng/trang |
| `days` | number | Số ngày gần nhất |

**Response Example:**

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "page_size": 50
  }
}
```

## Token Management

Quản lý Personal Access Token (sử dụng JWT auth)

### `GET /api/v2/tokens`

Lấy token hiện tại

Dùng JWT auth (session hiện tại). Trả về mảng 0-1 token

**Scope:** `session`

**Response Example:**

```json
{
  "success": true,
  "data": []
}
```

### `POST /api/v2/tokens`

Tạo token (không cần body)

Mỗi user chỉ có 1 token duy nhất với full quyền. Không cần request body

**Scope:** `session`

**Response Example:**

```json
{
  "success": true,
  "data": {
    "token": {},
    "raw_token": "pat-..."
  }
}
```

### `DELETE /api/v2/tokens/:id`

Thu hồi token

**Scope:** `session`

**Response Example:**

```json
{
  "success": true
}
```
