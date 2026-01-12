# 🚀 Quick Start for Frontend

## 📌 Current API Status

✅ **READY FOR INTEGRATION**

All authentication and user management endpoints are live and tested.

---

## 🔗 API Base URL

```
http://localhost:3000
```

---

## 🎯 5-Minute Integration Guide

### 1️⃣ Register User

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "user_id": 1,
      "email": "user@example.com",
      "status": "ACTIVE",
      "created_at": "2026-01-13T10:00:00Z"
    }
  }
}
```

### 2️⃣ Save Token

```dart
// Flutter Example
final token = response['data']['accessToken'];
await secureStorage.write(key: 'access_token', value: token);
```

### 3️⃣ Use Token in Requests

```dart
// Flutter Example with http package
final response = await http.get(
  Uri.parse('http://localhost:3000/users/me'),
  headers: {
    'Authorization': 'Bearer $token',
  },
);
```

### 4️⃣ Handle Errors

```dart
if (response.statusCode == 401) {
  // Token expired - redirect to login
  secureStorage.delete(key: 'access_token');
  Navigator.pushReplacementNamed(context, '/login');
}
```

---

## 📋 Available Endpoints

### Auth (Public)
- `POST /auth/register` - Create account
- `POST /auth/login` - Login

### Auth (Protected)
- `GET /auth/me` - Get current user

### Users (Protected)
- `GET /users` - List all users
- `GET /users/:id` - Get user
- `GET /users/me` - Get current user info
- `PATCH /users/me` - Update current user
- `GET /users/statistics` - Get stats

---

## 🔑 Auth Header Format

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## ⚠️ Important Notes

1. **Token Expiry:** 24 hours
2. **On 401 Error:** Token expired, user must login again
3. **All responses:** Wrapped in standardized format
4. **CORS:** Enabled for all origins

---

## 📱 Postman Collection

Import this into Postman:

**Register:**
```
POST http://localhost:3000/auth/register
Body (raw JSON):
{
  "email": "test@example.com",
  "password": "password123"
}
```

**Get Profile:**
```
GET http://localhost:3000/auth/me
Header: Authorization: Bearer {{token}}
```

Save token from register response and use in {{token}} variable.

---

## 🎯 Example Flutter Integration

```dart
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthService {
  final String baseUrl = 'http://localhost:3000';
  final storage = const FlutterSecureStorage();

  Future<bool> register(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      final token = data['data']['accessToken'];
      
      // Save token
      await storage.write(key: 'access_token', value: token);
      return true;
    }
    return false;
  }

  Future<Map?> getProfile() async {
    final token = await storage.read(key: 'access_token');
    
    final response = await http.get(
      Uri.parse('$baseUrl/auth/me'),
      headers: {'Authorization': 'Bearer $token'},
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body)['data'];
    } else if (response.statusCode == 401) {
      // Token expired
      await logout();
    }
    return null;
  }

  Future<void> logout() async {
    await storage.delete(key: 'access_token');
  }
}
```

---

## 📞 Questions?

Refer to [FE_API_GUIDE.md](./FE_API_GUIDE.md) for detailed endpoint documentation.

---

**Status:** ✅ Ready for Frontend Integration  
**Last Updated:** January 13, 2026
