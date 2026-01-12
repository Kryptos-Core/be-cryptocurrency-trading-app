# 📱 API Endpoints - For Frontend Developers

**Base URL:** `http://localhost:3000`

---

## 🔐 Authentication

### 1️⃣ Register (Đăng ký tài khoản)

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "user_id": 1,
      "email": "user@example.com",
      "status": "ACTIVE",
      "created_at": "2026-01-13T10:00:00.000Z"
    }
  },
  "timestamp": "2026-01-13T10:00:00.000Z"
}
```

**Error (409 Conflict):**
```json
{
  "statusCode": 409,
  "code": "EMAIL_EXISTS",
  "message": "Email already exists",
  "timestamp": "2026-01-13T10:00:00.000Z",
  "path": "/auth/register"
}
```

---

### 2️⃣ Login (Đăng nhập)

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "user_id": 1,
      "email": "user@example.com",
      "status": "ACTIVE",
      "created_at": "2026-01-13T10:00:00.000Z"
    }
  },
  "timestamp": "2026-01-13T10:00:00.000Z"
}
```

**Error (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "code": "UNAUTHORIZED",
  "message": "Invalid credentials",
  "timestamp": "2026-01-13T10:00:00.000Z",
  "path": "/auth/login"
}
```

---

### 3️⃣ Get Profile (Lấy thông tin user hiện tại)

```http
GET /auth/me
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "email": "user@example.com",
    "status": "ACTIVE",
    "created_at": "2026-01-13T10:00:00.000Z"
  },
  "timestamp": "2026-01-13T10:00:00.000Z"
}
```

**Error (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "code": "UNAUTHORIZED",
  "message": "Invalid or expired token",
  "timestamp": "2026-01-13T10:00:00.000Z",
  "path": "/auth/me"
}
```

---

## 👥 Users Management

### 4️⃣ Get All Users (Lấy danh sách users)

```http
GET /users?page=1&limit=10
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page`: Số trang (mặc định: 1)
- `limit`: Số bản ghi/trang (mặc định: 10)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "user_id": 1,
        "email": "user1@example.com",
        "status": "ACTIVE",
        "created_at": "2026-01-13T10:00:00.000Z"
      },
      {
        "user_id": 2,
        "email": "user2@example.com",
        "status": "ACTIVE",
        "created_at": "2026-01-13T11:00:00.000Z"
      }
    ],
    "total": 50
  },
  "timestamp": "2026-01-13T10:00:00.000Z"
}
```

---

### 5️⃣ Get User by ID (Lấy thông tin user theo ID)

```http
GET /users/:id
Authorization: Bearer <access_token>
```

**Example:**
```http
GET /users/1
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "email": "user@example.com",
    "status": "ACTIVE",
    "created_at": "2026-01-13T10:00:00.000Z"
  },
  "timestamp": "2026-01-13T10:00:00.000Z"
}
```

**Error (404 Not Found):**
```json
{
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "User with id 999 not found",
  "timestamp": "2026-01-13T10:00:00.000Z",
  "path": "/users/999"
}
```

---

### 6️⃣ Update Current User (Cập nhật thông tin user hiện tại)

```http
PATCH /users/me
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "newemail@example.com"
}
```

**Request Body (Optional):**
```json
{
  "email": "newemail@example.com",
  "status": "ACTIVE" // "ACTIVE" | "BANNED" | "PENDING"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "email": "newemail@example.com",
    "status": "ACTIVE",
    "created_at": "2026-01-13T10:00:00.000Z"
  },
  "timestamp": "2026-01-13T10:00:00.000Z"
}
```

---

### 7️⃣ Update User by ID (Cập nhật user khác - Admin)

```http
PATCH /users/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "newemail@example.com",
  "status": "ACTIVE"
}
```

---

### 8️⃣ Delete User (Xóa user - Soft delete)

```http
DELETE /users/:id
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "User deleted successfully"
  },
  "timestamp": "2026-01-13T10:00:00.000Z"
}
```

---

### 9️⃣ Get User Statistics (Lấy thống kê users)

```http
GET /users/statistics
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "total": 100,
    "active": 85,
    "banned": 10,
    "pending": 5
  },
  "timestamp": "2026-01-13T10:00:00.000Z"
}
```

---

## 🔒 Authentication Flow (For Frontend)

### Step 1: Đăng ký hoặc Đăng nhập
```javascript
// Register
const response = await fetch('http://localhost:3000/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const data = await response.json();
const accessToken = data.data.accessToken;
```

### Step 2: Lưu Token (Local Storage hoặc Secure Storage)
```javascript
// Save to local storage
localStorage.setItem('accessToken', accessToken);

// Or save to secure storage (recommended for mobile)
// await FlutterSecureStorage().write(key: 'accessToken', value: accessToken);
```

### Step 3: Sử dụng Token cho API Requests
```javascript
const response = await fetch('http://localhost:3000/users/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const data = await response.json();
console.log(data.data.user);
```

### Step 4: Handle Token Expiry
```javascript
// Nếu response status === 401, token đã hết hạn
if (response.status === 401) {
  // Clear token
  localStorage.removeItem('accessToken');
  
  // Redirect to login
  window.location.href = '/login';
}
```

---

## ⚠️ Error Codes & Status Codes

### HTTP Status Codes
- **200 OK** - Successful request
- **201 Created** - Resource created successfully
- **400 Bad Request** - Invalid request parameters
- **401 Unauthorized** - Missing or invalid token
- **404 Not Found** - Resource not found
- **409 Conflict** - Resource conflict (e.g., email exists)
- **422 Unprocessable Entity** - Validation error
- **500 Internal Server Error** - Server error

### Custom Error Codes
- `EMAIL_EXISTS` - Email already registered
- `UNAUTHORIZED` - Invalid credentials
- `NOT_FOUND` - Resource not found
- `ACCOUNT_BANNED` - Account has been banned
- `VALIDATION_ERROR` - Input validation failed
- `CONFLICT` - Resource conflict
- `INTERNAL_SERVER_ERROR` - Server error

---

## 📌 Important Notes

### Authorization Header
- **Format:** `Authorization: Bearer <access_token>`
- **Required for:** All endpoints except `/auth/register` and `/auth/login`
- **Missing token?** Returns `401 Unauthorized`

### Token Expiry
- **Duration:** 24 hours
- **Expiry:** Get new token by logging in again

### Request/Response Format
- **All requests:** Must include `Content-Type: application/json`
- **All responses:** Standardized format with `success`, `data`, `timestamp`

### CORS
- **Enabled:** Yes
- **Access-Control-Allow-Origin:** `*`

---

## 🚀 Testing with Postman

### 1. Create Environment Variables
```json
{
  "baseUrl": "http://localhost:3000",
  "accessToken": ""
}
```

### 2. Register User
```
POST {{baseUrl}}/auth/register
Body (raw JSON):
{
  "email": "test@example.com",
  "password": "password123"
}
```

### 3. Save Token to Variable
In **Tests** tab:
```javascript
var jsonData = pm.response.json();
pm.environment.set("accessToken", jsonData.data.accessToken);
```

### 4. Use Token in Next Requests
```
GET {{baseUrl}}/users/me
Headers:
Authorization: Bearer {{accessToken}}
```

---

## 📅 Status: Development

✅ **Completed:**
- Auth Module (Register, Login, Get Profile)
- Users Module (CRUD + Statistics)
- Exception Handling
- Global Middleware

🔄 **In Progress:**
- Wallets Module
- Markets Module
- Orders Module

📋 **TODO:**
- Trades Module
- Price Alerts
- WebSocket Integration
- Redis Caching

---

## 📞 Contact Backend Team

For API questions or issues, please reach out to the backend team.
