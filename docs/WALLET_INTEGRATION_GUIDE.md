# Hướng Dẫn Tích Hợp API Wallet cho Frontend

**Phiên bản:** 1.0.0  
**Ngày cập nhật:** February 2, 2026  
**Dành cho:** Frontend Developers

## 📋 Mục Lục

1. [Tổng Quan Mô Hình Wallet](#tổng-quan-mô-hình-wallet)
2. [API Endpoints](#api-endpoints)
3. [Data Models & DTOs](#data-models--dtos)
4. [Quy Trình Vận Hành](#quy-trình-vận-hành)
5. [Ví Dụ Tích Hợp](#ví-dụ-tích-hợp)
6. [Xử Lý Lỗi](#xử-lý-lỗi)
7. [Best Practices](#best-practices)

---

## 🎯 Tổng Quan Mô Hình Wallet

### Khái Niệm Cơ Bản

Wallet là hệ thống quản lý số dư tiền ảo của người dùng với các đặc điểm:

```
┌─────────────────────────────────────┐
│  WALLET (Ví Tiền Ảo)               │
├─────────────────────────────────────┤
│  💰 Available Balance               │  ← Số dư có sẵn để sử dụng
│  ❄️ Frozen Balance                 │  ← Số dư bị khóa (đang đặt lệnh)
│  ────────────────────────────────── │
│  📊 Total Balance                   │  ← Tổng = Available + Frozen
└─────────────────────────────────────┘
```

### Mô Hình Double-Entry Accounting (Sổ Cái Kép)

Mỗi giao dịch tạo ra **2 bản ghi** (CREDIT + DEBIT) để đảm bảo tính toàn vẹn dữ liệu:

```
Ví Dụ: User A gửi tiền (DEPOSIT 100 BTC)
┌──────────────────────────────────────┐
│ LEDGER ENTRY 1 (CREDIT)              │
├──────────────────────────────────────┤
│ User: A                              │
│ Direction: CREDIT (tiền vào)         │
│ Amount: 100 BTC                      │
│ Reference: DEPOSIT #12345            │
└──────────────────────────────────────┘
       ↓ [Tạo cặp ghi sổ]
┌──────────────────────────────────────┐
│ LEDGER ENTRY 2 (DEBIT)               │
├──────────────────────────────────────┤
│ User: System                         │
│ Direction: DEBIT (tiền ra)           │
│ Amount: 100 BTC                      │
│ Reference: DEPOSIT #12345            │
└──────────────────────────────────────┘
```

**Lợi ích:**
- ✅ Kiểm soát tính toàn vẹn: CREDIT = DEBIT
- ✅ Dễ dàng kiểm toán
- ✅ Phòng chống gian lận

---

## 🔌 API Endpoints

### 1️⃣ GET /wallets/balance

**Mục đích:** Lấy số dư hiện tại của ví

**Request:**
```http
GET /wallets/balance?currencyId=1
Authorization: Bearer {JWT_TOKEN}
```

**Parameters:**
| Tham Số | Kiểu | Bắt Buộc | Mô Tả |
|---------|------|---------|-------|
| `currencyId` | number | ✅ | ID của đồng tiền (1=BTC, 2=ETH, v.v) |

**Response (200 OK):**
```json
{
  "data": {
    "userId": 1,
    "currencyId": 1,
    "available": "50.5",
    "frozen": "10.25",
    "total": "60.75"
  },
  "statusCode": 200,
  "message": "Success"
}
```

**Response Fields:**
| Trường | Kiểu | Mô Tả |
|--------|------|-------|
| `available` | string | Số dư có sẵn (có thể rút, giao dịch) |
| `frozen` | string | Số dư bị khóa (đang đặt lệnh chưa khớp) |
| `total` | string | Tổng = available + frozen |

**Ví Dụ cURL:**
```bash
curl -X GET "http://localhost:3000/wallets/balance?currencyId=1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 2️⃣ POST /wallets/transactions

**Mục đích:** Thực hiện giao dịch ví (credit, debit, freeze, unfreeze, transfer)

**Request:**
```http
POST /wallets/transactions
Content-Type: application/json
Authorization: Bearer {JWT_TOKEN}
```

**Request Body:**
```json
{
  "currencyId": 1,
  "amount": "5.5",
  "action": "CREDIT",
  "refType": "DEPOSIT",
  "refId": 12345,
  "targetUserId": null
}
```

**Request Parameters:**

| Trường | Kiểu | Bắt Buộc | Mô Tả | Ví Dụ |
|--------|------|---------|-------|-------|
| `currencyId` | number | ✅ | ID đồng tiền | `1` (BTC) |
| `amount` | string | ✅ | Số tiền (decimal 0-18 chữ số) | `"5.5"`, `"0.00001234567890123456"` |
| `action` | enum | ✅ | Hành động giao dịch | `CREDIT`, `DEBIT`, `FREEZE`, `UNFREEZE`, `TRANSFER` |
| `refType` | enum | ✅ | Loại tham chiếu (audit trail) | `DEPOSIT`, `WITHDRAW`, `ORDER`, `TRADE`, `ADJUST`, `TRANSFER` |
| `refId` | number | ✅ | ID tham chiếu (deposit ID, order ID, v.v) | `12345` |
| `targetUserId` | number | ⚠️ | User ID người nhận (🔴 bắt buộc nếu action=TRANSFER) | `2` |

**Action Types (Các Loại Giao Dịch):**

| Action | Mô Tả | Available → ? | Frozen → ? | Khi Nào Dùng |
|--------|-------|---|---|---|
| `CREDIT` | Cộng vào available | +amount | Không đổi | Người dùng nạp tiền (deposit) |
| `DEBIT` | Trừ khỏi available | -amount | Không đổi | Người dùng rút tiền (withdraw) |
| `FREEZE` | Khóa tiền từ available | -amount | +amount | Đặt lệnh BUY/SELL |
| `UNFREEZE` | Mở khóa tiền | +amount | -amount | Hủy lệnh hoặc lệnh hết hạn |
| `TRANSFER` | Chuyển tiền sang user khác | -amount | Không đổi | Chuyển tiền giữa người dùng |

**Reference Types (Các Loại Tham Chiếu - cho Audit Trail):**

| RefType | Mô Tả | Ví Dụ |
|---------|-------|-------|
| `DEPOSIT` | Nạp tiền từ bên ngoài | Deposit #123 |
| `WITHDRAW` | Rút tiền ra ngoài | Withdrawal #456 |
| `ORDER` | Liên quan đến lệnh (freeze/unfreeze) | Order #789 |
| `TRADE` | Giao dịch thực tế (buy/sell) | Trade #101112 |
| `ADJUST` | Điều chỉnh thủ công (admin) | Manual Adjustment #999 |
| `TRANSFER` | Chuyển tiền giữa người dùng | Transfer to User #2 |

**Response (200 OK):**
```json
{
  "data": {
    "transactionId": "TXN_20260202_001",
    "userId": 1,
    "currencyId": 1,
    "action": "CREDIT",
    "amount": "5.5",
    "refType": "DEPOSIT",
    "refId": 12345,
    "newBalance": {
      "available": "55.5",
      "frozen": "10.25",
      "total": "65.75"
    },
    "timestamp": "2026-02-02T10:30:45.000Z"
  },
  "statusCode": 200,
  "message": "Transaction successful"
}
```

**Ví Dụ cURL:**
```bash
curl -X POST "http://localhost:3000/wallets/transactions" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "currencyId": 1,
    "amount": "5.5",
    "action": "CREDIT",
    "refType": "DEPOSIT",
    "refId": 12345
  }'
```

---

## 📦 Data Models & DTOs

### WalletBalanceDto (Response từ GET /balance)

```typescript
interface WalletBalanceDto {
  userId: number;
  currencyId: number;
  available: string;      // Decimal string, e.g., "50.5"
  frozen: string;         // Decimal string, e.g., "10.25"
  total: string;          // Decimal string, e.g., "60.75"
}
```

### WalletTransactionDto (Request POST /transactions)

```typescript
interface WalletTransactionDto {
  currencyId: number;           // 1-999999
  amount: string;               // Regex: ^\\d+(\\.\\d{1,18})?$
  action: WalletTransactionAction;
  refType: WalletReferenceType;
  refId: number;                // 1-999999
  targetUserId?: number;        // 1-999999 (required for TRANSFER)
}

enum WalletTransactionAction {
  CREDIT = "CREDIT",
  DEBIT = "DEBIT",
  FREEZE = "FREEZE",
  UNFREEZE = "UNFREEZE",
  TRANSFER = "TRANSFER"
}

enum WalletReferenceType {
  DEPOSIT = "DEPOSIT",
  WITHDRAW = "WITHDRAW",
  ORDER = "ORDER",
  TRADE = "TRADE",
  ADJUST = "ADJUST",
  TRANSFER = "TRANSFER"
}
```

---

## ⚙️ Quy Trình Vận Hành

### Quy Trình 1: Người Dùng Nạp Tiền (DEPOSIT)

```
┌─────────────────┐
│  Frontend       │
└────────┬────────┘
         │ 1. User nhấn "Nạp Tiền"
         │
┌────────▼────────────────────────┐
│  Tạo Deposit Record (Backend)   │ ← Deposit #123 created
│  Status: PENDING                │
└────────┬────────────────────────┘
         │ 2. Hiển thị QR/Địa chỉ cho user
         │
┌────────▼──────────────────────────┐
│  User gửi coin đến blockchain    │
└────────┬──────────────────────────┘
         │ 3. Blockchain xác nhận (1-10 phút)
         │
┌────────▼──────────────────────────────────┐
│  Update Deposit Status: CONFIRMED          │
│  Call Wallet API:                          │
│  POST /wallets/transactions {              │
│    action: "CREDIT",                       │
│    refType: "DEPOSIT",                     │
│    refId: 123,                             │
│    amount: "10.5"                          │
│  }                                         │
└────────┬──────────────────────────────────┘
         │ 4. Wallet balance cập nhật
         │   Available: +10.5 BTC
         │
┌────────▼─────────────────┐
│  Frontend hiển thị       │
│  "Nạp tiền thành công!"  │
└──────────────────────────┘
```

**Mã ví dụ JavaScript:**
```javascript
// Step 1: Nạp tiền (giả sử deposit đã được tạo)
const depositId = 123;
const amount = "10.5";
const currencyId = 1; // BTC

// Step 2: Gọi Wallet API để credit tiền
const response = await fetch("/wallets/transactions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    currencyId,
    amount,
    action: "CREDIT",           // ← Cộng vào available
    refType: "DEPOSIT",         // ← Loại tham chiếu
    refId: depositId            // ← ID deposit
  })
});

const { data } = await response.json();
console.log("Số dư mới:", data.newBalance);
// Output: { available: "60.5", frozen: "10.25", total: "70.75" }
```

---

### Quy Trình 2: Người Dùng Đặt Lệnh Mua (BUY ORDER)

```
┌──────────────────┐
│  User nhấn BUY   │
│  10 BTC @ 50000  │
└────────┬─────────┘
         │
┌────────▼────────────────────────────────┐
│  1. Check: available balance ≥ 50000    │
│     (10 BTC × 50000 = 500,000 USDT)     │
└────────┬────────────────────────────────┘
         │
┌────────▼────────────────────────────────┐
│  2. Tạo Order Record (Backend)          │
│     Status: OPEN                        │
│     Order #789                          │
└────────┬────────────────────────────────┘
         │
┌────────▼──────────────────────────────────────┐
│  3. FREEZE tiền (Lock Money):                 │
│     POST /wallets/transactions {              │
│       action: "FREEZE",  ← ⚠️ Khóa tiền      │
│       amount: "500000",                       │
│       refType: "ORDER",                       │
│       refId: 789         ← Order ID           │
│     }                                         │
│     Available: 500,000 → Frozen: +500,000    │
└────────┬──────────────────────────────────────┘
         │
┌────────▼──────────────────────────────┐
│  4. Frontend hiển thị:                │
│     "Số tiền đã khóa cho lệnh"        │
│     Available: 0 USDT                 │
│     Frozen: 500,000 USDT              │
└──────────────────────────────────────┘

═══════════════════════════════════════

[A] Lệnh được khớp (FILLED)
────────────────────────────────────
│
└─► Order Status: FILLED
│
└─► Giao dịch tạo (Trade #101)
│   User mất: 500,000 USDT (từ frozen)
│   User được: 10 BTC (khác ví)
│
└─► Không cần unfreeze (tiền đã bị xóa)

[B] Người dùng hủy lệnh (CANCELLED)
───────────────────────────────────
│
└─► Order Status: CANCELLED
│
└─► UNFREEZE tiền:
    POST /wallets/transactions {
      action: "UNFREEZE",  ← Mở khóa
      amount: "500000",
      refType: "ORDER",
      refId: 789
    }
    Frozen: 500,000 → Available: +500,000
```

**Mã ví dụ JavaScript:**
```javascript
// Step 1: Đặt lệnh BUY
const placeOrder = async (amount, price, pairId) => {
  const orderResponse = await fetch("/orders", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ amount, price, pairId, side: "BUY" })
  });
  const { data: order } = await orderResponse.json();
  
  // Step 2: FREEZE tiền
  const freezeResponse = await fetch("/wallets/transactions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      currencyId: 2,              // USDT
      amount: (amount * price).toString(),
      action: "FREEZE",           // ← Khóa tiền
      refType: "ORDER",
      refId: order.id             // ← Liên kết tới Order
    })
  });
  
  console.log("Tiền đã khóa cho lệnh");
  return order;
};

// Step 3: Nếu hủy lệnh → UNFREEZE
const cancelOrder = async (orderId) => {
  const order = await getOrder(orderId);
  
  const unfreezeResponse = await fetch("/wallets/transactions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      currencyId: 2,
      amount: (order.amount * order.price).toString(),
      action: "UNFREEZE",         // ← Mở khóa tiền
      refType: "ORDER",
      refId: orderId
    })
  });
  
  console.log("Tiền đã được mở khóa");
};
```

---

### Quy Trình 3: Người Dùng Rút Tiền (WITHDRAW)

```
┌──────────────────┐
│  User nhấn RÚT   │
│  5 BTC           │
└────────┬─────────┘
         │
┌────────▼───────────────────────────┐
│  1. Check: available ≥ 5 BTC       │
└────────┬───────────────────────────┘
         │
┌────────▼──────────────────────────────┐
│  2. Tạo Withdrawal Record             │
│     Status: REQUESTED                 │
│     Withdrawal #456                   │
└────────┬──────────────────────────────┘
         │
┌────────▼──────────────────────────────────────┐
│  3. DEBIT tiền từ ví:                        │
│     POST /wallets/transactions {              │
│       action: "DEBIT",   ← Trừ tiền          │
│       amount: "5",                            │
│       refType: "WITHDRAW",                    │
│       refId: 456        ← Withdrawal ID       │
│     }                                         │
│     Available: 5 BTC → (trừ đi)              │
└────────┬──────────────────────────────────────┘
         │
┌────────▼──────────────────────────────┐
│  4. Gửi BTC đến địa chỉ user         │
│     (Blockchain confirmation)         │
│     Withdrawal Status: SENT           │
└────────┬──────────────────────────────┘
         │
┌────────▼──────────────────────────────┐
│  5. Frontend hiển thị:                │
│     "Rút tiền thành công!"            │
│     Tiền sẽ tới ví trong 10-30 phút   │
└──────────────────────────────────────┘
```

**Mã ví dụ JavaScript:**
```javascript
const withdrawFunds = async (amount, currencyId, withdrawalId) => {
  const response = await fetch("/wallets/transactions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      currencyId,
      amount: amount.toString(),
      action: "DEBIT",            // ← Trừ tiền
      refType: "WITHDRAW",
      refId: withdrawalId
    })
  });
  
  const { data } = await response.json();
  console.log("Tiền đã bị trừ. Saldo mới:", data.newBalance);
  return data;
};
```

---

### Quy Trình 4: Chuyển Tiền Giữa Người Dùng (TRANSFER)

```
┌────────────────────┐
│  User A nhấn       │
│  "Chuyển tiền"     │
│  → User B          │
└────────┬───────────┘
         │
┌────────▼────────────────────────────────────┐
│  1. Check: A.available ≥ amount              │
└────────┬────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────┐
│  2. User A: DEBIT tiền:                           │
│     POST /wallets/transactions {                    │
│       action: "TRANSFER",  ← Chuyển tiền           │
│       amount: "5",                                  │
│       refType: "TRANSFER",                          │
│       refId: transfer_id,                           │
│       targetUserId: B.id    ← 🔴 Bắt buộc!        │
│     }                                               │
│     A.available: 5 → (trừ đi)                      │
└────────┬────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────┐
│  3. User B: CREDIT tiền:                           │
│     POST /wallets/transactions {                    │
│       action: "CREDIT",    ← Cộng tiền             │
│       amount: "5",                                  │
│       refType: "TRANSFER",                          │
│       refId: transfer_id   ← Cùng transfer_id      │
│     }                                               │
│     B.available: +5 BTC                            │
└────────┬────────────────────────────────────────────┘
         │
┌────────▼──────────────────────────────┐
│  4. Frontend hiển thị:                │
│     "Chuyển tiền thành công!"         │
│     User B nhận được: 5 BTC           │
└──────────────────────────────────────┘
```

**Mã ví dụ JavaScript:**
```javascript
const transferFunds = async (amount, currencyId, targetUserId, transferId) => {
  // Step 1: Debit từ ví người gửi
  const debitResponse = await fetch("/wallets/transactions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      currencyId,
      amount: amount.toString(),
      action: "TRANSFER",           // ← Chuyển tiền (debit)
      refType: "TRANSFER",
      refId: transferId,
      targetUserId              // ← Người nhận
    })
  });
  
  const { data: debitData } = await debitResponse.json();
  console.log("Tiền đã trừ từ ví:", debitData.newBalance);
  
  // Step 2: Credit vào ví người nhận
  // (Backend tự động xử lý, nhưng FE có thể log/notify)
  console.log("Tiền đã chuyển đến người dùng:", targetUserId);
  
  return debitData;
};
```

---

## 💥 Ví Dụ Tích Hợp

### Ví Dụ 1: React Hook - useWallet

```typescript
// hooks/useWallet.ts
import { useState, useCallback } from 'react';

interface WalletBalance {
  available: string;
  frozen: string;
  total: string;
}

export const useWallet = (currencyId: number) => {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lấy số dư hiện tại
  const fetchBalance = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/wallets/balance?currencyId=${currencyId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );
      const { data } = await response.json();
      setBalance(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [currencyId]);

  // Thực hiện giao dịch
  const executeTransaction = useCallback(
    async (
      action: 'CREDIT' | 'DEBIT' | 'FREEZE' | 'UNFREEZE' | 'TRANSFER',
      amount: string,
      refType: string,
      refId: number,
      targetUserId?: number
    ) => {
      try {
        const response = await fetch('/wallets/transactions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            currencyId,
            amount,
            action,
            refType,
            refId,
            targetUserId
          })
        });

        if (!response.ok) {
          throw new Error(`Transaction failed: ${response.statusText}`);
        }

        const { data } = await response.json();
        setBalance(data.newBalance);
        return data;
      } catch (err) {
        const errorMsg = (err as Error).message;
        setError(errorMsg);
        throw err;
      }
    },
    [currencyId]
  );

  return { balance, loading, error, fetchBalance, executeTransaction };
};

// Component sử dụng
import { useWallet } from './hooks/useWallet';

function WalletComponent() {
  const { balance, loading, fetchBalance, executeTransaction } = useWallet(1); // BTC

  const handleDeposit = async (amount: string) => {
    const depositId = 123; // Giả sử tạo deposit trước đó
    const result = await executeTransaction('CREDIT', amount, 'DEPOSIT', depositId);
    console.log('Nạp tiền thành công:', result);
  };

  return (
    <div>
      <button onClick={fetchBalance}>Tải số dư</button>
      {loading && <p>Đang tải...</p>}
      {balance && (
        <div>
          <p>Số dư: {balance.available} BTC</p>
          <p>Khóa: {balance.frozen} BTC</p>
          <p>Tổng: {balance.total} BTC</p>
          <button onClick={() => handleDeposit('5.5')}>Nạp 5.5 BTC</button>
        </div>
      )}
    </div>
  );
}
```

---

### Ví Dụ 2: Angular Service - WalletService

```typescript
// services/wallet.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

interface WalletBalance {
  userId: number;
  currencyId: number;
  available: string;
  frozen: string;
  total: string;
}

interface TransactionRequest {
  currencyId: number;
  amount: string;
  action: 'CREDIT' | 'DEBIT' | 'FREEZE' | 'UNFREEZE' | 'TRANSFER';
  refType: string;
  refId: number;
  targetUserId?: number;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private apiUrl = 'http://localhost:3000';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    });
  }

  // Lấy số dư
  getBalance(currencyId: number): Observable<{ data: WalletBalance }> {
    return this.http.get<{ data: WalletBalance }>(
      `${this.apiUrl}/wallets/balance?currencyId=${currencyId}`,
      { headers: this.getHeaders() }
    );
  }

  // Thực hiện giao dịch
  executeTransaction(request: TransactionRequest): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/wallets/transactions`,
      request,
      { headers: this.getHeaders() }
    );
  }

  // Helper: CREDIT (nạp tiền)
  creditBalance(
    currencyId: number,
    amount: string,
    depositId: number
  ): Observable<any> {
    return this.executeTransaction({
      currencyId,
      amount,
      action: 'CREDIT',
      refType: 'DEPOSIT',
      refId: depositId
    });
  }

  // Helper: FREEZE (khóa tiền cho lệnh)
  freezeBalance(
    currencyId: number,
    amount: string,
    orderId: number
  ): Observable<any> {
    return this.executeTransaction({
      currencyId,
      amount,
      action: 'FREEZE',
      refType: 'ORDER',
      refId: orderId
    });
  }

  // Helper: UNFREEZE (mở khóa tiền)
  unfreezeBalance(
    currencyId: number,
    amount: string,
    orderId: number
  ): Observable<any> {
    return this.executeTransaction({
      currencyId,
      amount,
      action: 'UNFREEZE',
      refType: 'ORDER',
      refId: orderId
    });
  }
}

// Component sử dụng
import { Component, OnInit } from '@angular/core';
import { WalletService } from './services/wallet.service';

@Component({
  selector: 'app-wallet',
  template: `
    <div *ngIf="balance">
      <p>Available: {{ balance.available }} BTC</p>
      <p>Frozen: {{ balance.frozen }} BTC</p>
      <p>Total: {{ balance.total }} BTC</p>
      <button (click)="onDeposit()">Nạp tiền</button>
    </div>
  `
})
export class WalletComponent implements OnInit {
  balance: any;

  constructor(private walletService: WalletService) {}

  ngOnInit() {
    this.walletService.getBalance(1).subscribe(({ data }) => {
      this.balance = data;
    });
  }

  onDeposit() {
    this.walletService.creditBalance(1, '5.5', 123).subscribe(({ data }) => {
      this.balance = data.newBalance;
    });
  }
}
```

---

## ⚠️ Xử Lý Lỗi

### Các Lỗi Phổ Biến

#### 1. **400 Bad Request - Validation Error**

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "amount",
      "message": "amount must be a valid decimal number with up to 18 decimals"
    }
  ]
}
```

**Giải pháp:**
```javascript
// ❌ Sai: Số thập phân quá nhiều
"amount": "5.12345678901234567890"  // 20 chữ số

// ✅ Đúng: Tối đa 18 chữ số
"amount": "5.123456789012345678"    // 18 chữ số

// ✅ Đúng: Có thể ít hơn
"amount": "5.5"                      // 1 chữ số
```

#### 2. **400 Bad Request - Insufficient Balance**

```json
{
  "statusCode": 400,
  "message": "Insufficient available balance",
  "data": {
    "required": "100",
    "available": "50.5"
  }
}
```

**Giải pháp:**
```javascript
// Kiểm tra trước khi gửi request
const canWithdraw = (available: string, amount: string) => {
  const availableDec = new Decimal(available);
  const amountDec = new Decimal(amount);
  return availableDec.greaterThanOrEqualTo(amountDec);
};

if (!canWithdraw(balance.available, "100")) {
  showError(`Số dư không đủ. Bạn có: ${balance.available}`);
  return;
}
```

#### 3. **401 Unauthorized**

```json
{
  "statusCode": 401,
  "message": "Unauthorized - Invalid or expired token"
}
```

**Giải pháp:**
```javascript
// Gọi refresh token hoặc redirect đến login
if (response.status === 401) {
  localStorage.removeItem('token');
  window.location.href = '/login';
}
```

#### 4. **422 Unprocessable Entity - Business Logic Error**

```json
{
  "statusCode": 422,
  "message": "Cannot transfer to yourself",
  "code": "INVALID_TRANSFER_TARGET"
}
```

**Giải pháp:**
```javascript
// Kiểm tra targetUserId khác userId
if (targetUserId === currentUserId) {
  showError("Không thể chuyển tiền cho chính mình");
  return;
}
```

#### 5. **500 Internal Server Error**

```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "requestId": "REQ_20260202_12345"
}
```

**Giải pháp:**
```javascript
// Ghi log requestId và thực hiện retry
console.error("Server error - Request ID:", response.data.requestId);

// Retry sau 1 giây
setTimeout(() => {
  retryTransaction();
}, 1000);
```

---

## 🎯 Best Practices

### 1. **Validation Trước Khi Gửi Request**

```typescript
const validateTransaction = (
  balance: WalletBalance,
  action: string,
  amount: string,
  targetUserId?: number
): string | null => {
  const amountDec = new Decimal(amount);

  // Kiểm tra amount > 0
  if (amountDec.lessThanOrEqualTo(0)) {
    return "Số tiền phải lớn hơn 0";
  }

  // Kiểm tra decimal places
  if (!/^\d+(\.\d{1,18})?$/.test(amount)) {
    return "Số tiền không hợp lệ (tối đa 18 chữ số thập phân)";
  }

  // Kiểm tra balance theo action
  switch (action) {
    case 'DEBIT':
    case 'FREEZE':
      if (new Decimal(balance.available).lessThan(amountDec)) {
        return `Số dư không đủ. Bạn có: ${balance.available}`;
      }
      break;

    case 'UNFREEZE':
      if (new Decimal(balance.frozen).lessThan(amountDec)) {
        return `Tiền khóa không đủ. Bạn có: ${balance.frozen}`;
      }
      break;

    case 'TRANSFER':
      if (!targetUserId) {
        return "Phải chỉ định người nhận";
      }
      if (new Decimal(balance.available).lessThan(amountDec)) {
        return `Số dư không đủ để chuyển`;
      }
      break;
  }

  return null; // Validation passed
};

// Sử dụng
const error = validateTransaction(balance, 'TRANSFER', amount, targetId);
if (error) {
  showError(error);
  return;
}
```

### 2. **Caching & Refresh Balance**

```typescript
// useWallet hook với caching
const useWallet = (currencyId: number, autoRefreshMs = 5000) => {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const cacheRef = useRef<{ balance: WalletBalance; timestamp: number } | null>(null);

  const fetchBalance = useCallback(async (forceRefresh = false) => {
    // Nếu cache còn hợp lệ và không force refresh
    if (!forceRefresh && cacheRef.current) {
      const cacheAge = Date.now() - cacheRef.current.timestamp;
      if (cacheAge < autoRefreshMs) {
        setBalance(cacheRef.current.balance);
        return;
      }
    }

    // Fetch từ server
    const response = await fetch(`/wallets/balance?currencyId=${currencyId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const { data } = await response.json();
    
    // Update cache
    cacheRef.current = { balance: data, timestamp: Date.now() };
    setBalance(data);
  }, [currencyId]);

  // Auto-refresh balance mỗi 5 giây
  useEffect(() => {
    const interval = setInterval(() => fetchBalance(), autoRefreshMs);
    fetchBalance(); // Fetch ngay khi mount
    return () => clearInterval(interval);
  }, [autoRefreshMs, fetchBalance]);

  return { balance, fetchBalance };
};
```

### 3. **Optimistic Update**

```typescript
// Cập nhật UI ngay mà không chờ response từ server
const handleFreeze = async (amount: string, orderId: number) => {
  // 1. Cập nhật UI ngay (optimistic)
  const newAvailable = new Decimal(balance.available).minus(amount).toString();
  const newFrozen = new Decimal(balance.frozen).plus(amount).toString();
  
  setBalance({
    ...balance,
    available: newAvailable,
    frozen: newFrozen,
    total: new Decimal(newAvailable).plus(newFrozen).toString()
  });

  // 2. Gửi request lên server
  try {
    const result = await executeTransaction(
      'FREEZE',
      amount,
      'ORDER',
      orderId
    );
    
    // 3. Nếu thành công, không cần update (đã update ở step 1)
    console.log('Freeze thành công');
  } catch (error) {
    // 4. Nếu fail, rollback balance
    const originalAvailable = new Decimal(balance.available).plus(amount).toString();
    const originalFrozen = new Decimal(balance.frozen).minus(amount).toString();
    
    setBalance({
      ...balance,
      available: originalAvailable,
      frozen: originalFrozen,
      total: new Decimal(originalAvailable).plus(originalFrozen).toString()
    });
    
    showError('Không thể khóa tiền. Vui lòng thử lại.');
  }
};
```

### 4. **Error Boundary & Retry Logic**

```typescript
// Wrapper với retry
const executeWithRetry = async (
  fn: () => Promise<any>,
  maxRetries = 3,
  delayMs = 1000
): Promise<any> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error; // Last attempt failed
      }

      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => 
        setTimeout(resolve, delayMs * Math.pow(2, attempt - 1))
      );
    }
  }
};

// Sử dụng
await executeWithRetry(() =>
  executeTransaction('CREDIT', '5.5', 'DEPOSIT', 123),
  3,
  1000
);
```

### 5. **Monitor & Log Transactions**

```typescript
// Tạo log transaction cho debugging
interface TransactionLog {
  id: string;
  timestamp: string;
  action: string;
  amount: string;
  refId: number;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  balanceBefore?: WalletBalance;
  balanceAfter?: WalletBalance;
}

const logTransaction = (
  transactionLog: TransactionLog
) => {
  // Gửi đến server để log
  fetch('/api/logs/transactions', {
    method: 'POST',
    body: JSON.stringify(transactionLog)
  });

  // Hoặc local storage
  const logs = JSON.parse(localStorage.getItem('txnLogs') || '[]');
  logs.push(transactionLog);
  localStorage.setItem('txnLogs', JSON.stringify(logs.slice(-100))); // Giữ 100 log mới nhất
};
```

### 6. **Xử Lý Decimal Chính Xác**

```typescript
import Decimal from 'decimal.js';

// ❌ Sai: Dùng number JavaScript
const wrongSum = 0.1 + 0.2;  // 0.30000000000000004

// ✅ Đúng: Dùng Decimal.js
const correctSum = new Decimal('0.1')
  .plus(new Decimal('0.2'))
  .toString();  // "0.3"

// Helper function
const safeAdd = (a: string, b: string): string =>
  new Decimal(a).plus(new Decimal(b)).toString();

const safeSubtract = (a: string, b: string): string =>
  new Decimal(a).minus(new Decimal(b)).toString();

const safeMultiply = (a: string, b: string): string =>
  new Decimal(a).times(new Decimal(b)).toString();
```

---

## 📞 FAQ

### Q1: Sự khác nhau giữa Available & Frozen là gì?

**A:** 
- **Available:** Tiền có sẵn để sử dụng (rút, chuyển, mua)
- **Frozen:** Tiền bị khóa cho các lệnh đang chờ khớp

**Ví dụ:**
- Available: 100 USDT
- User đặt lệnh BUY 50 USDT (FREEZE 50)
- Available: 50 USDT (còn lại để rút)
- Frozen: 50 USDT (đang đặt lệnh)
- Total: 100 USDT (không đổi)

---

### Q2: Khi nào dùng TRANSFER vs DEBIT?

**A:**
- **DEBIT:** Tiền rời khỏi ví (rút ngoài, bị trừ admin)
- **TRANSFER:** Chuyển sang user khác (vẫn trong hệ thống)

```
DEBIT:     Wallet → Blockchain
TRANSFER:  Wallet A → Wallet B
```

---

### Q3: Làm sao để đảm bảo transaction không bị duplicate?

**A:** Dùng `refId` để idempotency:
```javascript
// Request 1: CREDIT 5 BTC, refId: 12345
// Request 2: CREDIT 5 BTC, refId: 12345 (duplicate)
// → Server chỉ xử lý 1 lần
```

Backend kiểm tra `(refType, refId)` để ngăn duplicate.

---

### Q4: Tại sao dùng string cho amount thay vì number?

**A:** Để tránh lỗi floating-point:
```javascript
// Number JavaScript
0.1 + 0.2 === 0.3  // false! (0.30000000000000004)

// String + Decimal.js
new Decimal('0.1').plus('0.2').equals('0.3')  // true
```

---

### Q5: Làm thế nào để xử lý concurrent requests?

**A:** Server dùng pessimistic locking (SELECT FOR UPDATE):
```sql
SELECT * FROM wallets WHERE id = ? FOR UPDATE;  -- Lock ví
-- Transaction xử lý
UPDATE wallets SET available = ...;
-- Release lock tự động
```

FE không cần lo về race condition - Backend đảm bảo consistency.

---

## 📚 Tài Liệu Liên Quan

- [API Documentation](./API.md)
- [Database Schema](./SCHEMA.md)
- [WALLETS_ARCHITECTURE.md](./WALLETS_ARCHITECTURE.md)
- [Stored Procedures List](./PROCEDURES.md)

---

**Phiên bản cuối cùng:** 1.0.0  
**Cập nhật cuối:** February 2, 2026  
**Tác giả:** Backend Team  
**Liên hệ:** backend-support@crypto-trading.com
