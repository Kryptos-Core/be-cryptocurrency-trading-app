# API Testing Guide

## Test with cURL or Postman

### 1. Register a new user

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Response:** You'll get an `accessToken`. Copy it for the next requests.

### 3. Get Profile (Protected)

```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

### 4. Get All Users (Protected)

```bash
curl -X GET "http://localhost:3000/users?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

### 5. Get User Statistics

```bash
curl -X GET http://localhost:3000/users/statistics \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

### 6. Update Current User

```bash
curl -X PATCH http://localhost:3000/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com"
  }'
```

## Testing with Postman

1. Import the following as a collection
2. Set `{{baseUrl}}` = `http://localhost:3000`
3. After login, save `accessToken` to `{{token}}` variable
4. Use `Bearer {{token}}` in Authorization header

## Expected Responses

### Success Response Format:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-01-13T00:00:00.000Z"
}
```

### Error Response Format:
```json
{
  "statusCode": 400,
  "code": "ERROR_CODE",
  "message": "Error description",
  "timestamp": "2026-01-13T00:00:00.000Z",
  "path": "/api/endpoint"
}
```
