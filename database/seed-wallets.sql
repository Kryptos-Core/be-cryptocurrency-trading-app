-- ============================================
-- Sample Data for Wallets Table
-- File: database/seed-wallets.sql
-- Description: Import dữ liệu mẫu cho bảng wallets
-- ============================================

-- Lưu ý: Phải import users và currencies trước khi chạy script này
-- Chạy theo thứ tự:
-- 1. database/seed-currencies.sql
-- 2. Tạo user test (hoặc đã có users từ registration)

-- Xóa dữ liệu cũ (nếu có)
-- Lưu ý: Chỉ chạy khi muốn reset dữ liệu
-- DELETE FROM wallet_ledger;
-- DELETE FROM wallets;

-- Disable foreign key checks tạm thời (nếu cần)
SET FOREIGN_KEY_CHECKS = 0;

-- Reset AUTO_INCREMENT (nếu muốn bắt đầu từ 1)
-- ALTER TABLE wallets AUTO_INCREMENT = 1;
-- ALTER TABLE wallet_ledger AUTO_INCREMENT = 1;

-- ============================================
-- Chọn user có sẵn để gán wallets
-- Ưu tiên user đã tồn tại trong bảng users
-- ============================================
SET @user1 := (SELECT user_id FROM users ORDER BY user_id ASC LIMIT 1);
SET @user2 := (SELECT user_id FROM users ORDER BY user_id ASC LIMIT 1 OFFSET 1);
SET @user3 := (SELECT user_id FROM users ORDER BY user_id ASC LIMIT 1 OFFSET 2);

-- ============================================
-- INSERT Sample Wallets
-- ============================================

-- Trader 1: Multi-currency portfolio (Major coins)
INSERT INTO wallets (user_id, currency_id, available, frozen)
SELECT 
    @user1,
    currency_id,
    CASE symbol
        -- Major cryptocurrencies với balance cao
        WHEN 'BTC' THEN '2.50000000'
        WHEN 'ETH' THEN '15.75000000'
        WHEN 'BNB' THEN '50.00000000'
        WHEN 'USDT' THEN '100000.00000000'
        WHEN 'USDC' THEN '50000.00000000'
        WHEN 'SOL' THEN '200.00000000'
        WHEN 'ADA' THEN '10000.00000000'
        WHEN 'XRP' THEN '15000.00000000'
        WHEN 'AVAX' THEN '300.00000000'
        WHEN 'MATIC' THEN '5000.00000000'
        ELSE '1000.00000000'
    END as available,
    CASE symbol
        -- Một số coin có frozen balance (đang có orders)
        WHEN 'BTC' THEN '0.50000000'
        WHEN 'ETH' THEN '2.25000000'
        WHEN 'USDT' THEN '10000.00000000'
        WHEN 'SOL' THEN '50.00000000'
        ELSE '0.00000000'
    END as frozen
FROM currencies
WHERE symbol IN ('BTC', 'ETH', 'BNB', 'USDT', 'USDC', 'SOL', 'ADA', 'XRP', 'AVAX', 'MATIC', 'DOT', 'LINK')
    AND is_active = 1
    AND @user1 IS NOT NULL
ON DUPLICATE KEY UPDATE
    available = VALUES(available),
    frozen = VALUES(frozen);

-- Trader 2: Altcoin enthusiast portfolio
INSERT INTO wallets (user_id, currency_id, available, frozen)
SELECT 
    @user2,
    currency_id,
    CASE symbol
        -- Focus on altcoins
        WHEN 'BTC' THEN '0.25000000'
        WHEN 'BNB' THEN '120.00000000'
        WHEN 'SOL' THEN '150.00000000'
        WHEN 'ETH' THEN '8.00000000'
        WHEN 'USDT' THEN '50000.00000000'
        WHEN 'AVAX' THEN '500.00000000'
        WHEN 'MATIC' THEN '10000.00000000'
        WHEN 'LINK' THEN '1000.00000000'
        WHEN 'UNI' THEN '800.00000000'
        WHEN 'AAVE' THEN '50.00000000'
        WHEN 'ATOM' THEN '500.00000000'
        WHEN 'ALGO' THEN '5000.00000000'
        WHEN 'FTM' THEN '20000.00000000'
        ELSE '500.00000000'
    END as available,
    '0.00000000' as frozen
FROM currencies
WHERE symbol IN ('BTC', 'BNB', 'SOL', 'ETH', 'USDT', 'AVAX', 'MATIC', 'LINK', 'UNI', 'AAVE', 'ATOM', 'ALGO', 'FTM', 'ARB', 'OP')
    AND is_active = 1
    AND @user2 IS NOT NULL
ON DUPLICATE KEY UPDATE
    available = VALUES(available),
    frozen = VALUES(frozen);

-- Trader 3: Conservative trader (Stablecoins + BTC/ETH)
INSERT INTO wallets (user_id, currency_id, available, frozen)
SELECT 
    @user3,
    currency_id,
    CASE symbol
        -- Mostly stablecoins
        WHEN 'BTC' THEN '0.50000000'
        WHEN 'ETH' THEN '5.00000000'
        WHEN 'USDT' THEN '200000.00000000'
        WHEN 'USDC' THEN '150000.00000000'
        WHEN 'DAI' THEN '50000.00000000'
        WHEN 'BUSD' THEN '25000.00000000'
        WHEN 'BNB' THEN '100.00000000'
        ELSE '0.00000000'
    END as available,
    CASE symbol
        WHEN 'USDT' THEN '20000.00000000'
        WHEN 'BTC' THEN '0.10000000'
        ELSE '0.00000000'
    END as frozen
FROM currencies
WHERE symbol IN ('BTC', 'ETH', 'BNB', 'USDT', 'USDC', 'DAI', 'BUSD')
    AND is_active = 1
    AND @user3 IS NOT NULL
ON DUPLICATE KEY UPDATE
    available = VALUES(available),
    frozen = VALUES(frozen);

-- ============================================
-- INSERT Sample Wallet Ledger Entries
-- ============================================

-- Trader 1: Initial deposits
INSERT IGNORE INTO wallet_ledger (user_id, currency_id, ref_type, ref_id, direction, amount, balance_after)
SELECT 
    @user1,
    currency_id,
    'DEPOSIT',
    100000 + currency_id,
    'CREDIT',
    CASE symbol
        WHEN 'BTC' THEN '3.00000000'
        WHEN 'ETH' THEN '18.00000000'
        WHEN 'USDT' THEN '110000.00000000'
        ELSE '1000.00000000'
    END as amount,
    CASE symbol
        WHEN 'BTC' THEN '3.00000000'
        WHEN 'ETH' THEN '18.00000000'
        WHEN 'USDT' THEN '110000.00000000'
        ELSE '1000.00000000'
    END as balance_after
FROM currencies
WHERE symbol IN ('BTC', 'ETH', 'USDT', 'SOL', 'ADA')
    AND is_active = 1
    AND @user1 IS NOT NULL
LIMIT 5;

-- Trader 2: Initial deposits
INSERT IGNORE INTO wallet_ledger (user_id, currency_id, ref_type, ref_id, direction, amount, balance_after)
SELECT 
    @user2,
    currency_id,
    'DEPOSIT',
    200000 + currency_id,
    'CREDIT',
    CASE symbol
        WHEN 'SOL' THEN '150.00000000'
        WHEN 'ETH' THEN '8.00000000'
        WHEN 'USDT' THEN '50000.00000000'
        WHEN 'AVAX' THEN '500.00000000'
        ELSE '500.00000000'
    END as amount,
    CASE symbol
        WHEN 'SOL' THEN '150.00000000'
        WHEN 'ETH' THEN '8.00000000'
        WHEN 'USDT' THEN '50000.00000000'
        WHEN 'AVAX' THEN '500.00000000'
        ELSE '500.00000000'
    END as balance_after
FROM currencies
WHERE symbol IN ('SOL', 'ETH', 'USDT', 'AVAX', 'MATIC', 'LINK')
    AND is_active = 1
    AND @user2 IS NOT NULL
LIMIT 5;

-- Trader 3: Initial deposits
INSERT IGNORE INTO wallet_ledger (user_id, currency_id, ref_type, ref_id, direction, amount, balance_after)
SELECT 
    @user3,
    currency_id,
    'DEPOSIT',
    300000 + currency_id,
    'CREDIT',
    CASE symbol
        WHEN 'USDT' THEN '220000.00000000'
        WHEN 'USDC' THEN '150000.00000000'
        WHEN 'BTC' THEN '0.60000000'
        ELSE '0.00000000'
    END as amount,
    CASE symbol
        WHEN 'USDT' THEN '220000.00000000'
        WHEN 'USDC' THEN '150000.00000000'
        WHEN 'BTC' THEN '0.60000000'
        ELSE '0.00000000'
    END as balance_after
FROM currencies
WHERE symbol IN ('BTC', 'USDT', 'USDC')
    AND is_active = 1
    AND @user3 IS NOT NULL
LIMIT 3;

-- ============================================
-- Sync relation columns created by TypeORM
-- (userUserId, currencyCurrencyId, walletWalletId)
-- ============================================

-- Wallets: align relation columns with FK values
UPDATE wallets
SET
    userUserId = user_id,
    currencyCurrencyId = currency_id
WHERE (userUserId IS NULL OR currencyCurrencyId IS NULL);

-- Wallet ledger: align relation columns with FK values
UPDATE wallet_ledger wl
SET
    wl.userUserId = wl.user_id,
    wl.currencyCurrencyId = wl.currency_id
WHERE (wl.userUserId IS NULL OR wl.currencyCurrencyId IS NULL);

-- Wallet ledger: link to wallets
UPDATE wallet_ledger wl
JOIN wallets w
  ON w.user_id = wl.user_id AND w.currency_id = wl.currency_id
SET wl.walletWalletId = w.wallet_id
WHERE wl.walletWalletId IS NULL;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- Verification Queries
-- ============================================

-- Show total balances by user
SELECT 
    u.username,
    COUNT(w.wallet_id) as total_wallets,
    SUM(CASE WHEN w.available > 0 OR w.frozen > 0 THEN 1 ELSE 0 END) as wallets_with_balance
FROM users u
LEFT JOIN wallets w ON u.user_id = w.user_id
WHERE u.username IN ('trader1', 'trader2', 'trader3')
GROUP BY u.user_id, u.username
ORDER BY u.username;

-- Show wallet details
SELECT 
    u.username,
    c.symbol,
    c.name,
    w.available,
    w.frozen,
    (w.available + w.frozen) as total_balance
FROM wallets w
INNER JOIN users u ON w.user_id = u.user_id
INNER JOIN currencies c ON w.currency_id = c.currency_id
WHERE u.username IN ('trader1', 'trader2', 'trader3')
    AND (w.available > 0 OR w.frozen > 0)
ORDER BY u.username, total_balance DESC;

-- Show ledger entries
SELECT 
    u.username,
    c.symbol,
    wl.ref_type,
    wl.direction,
    wl.amount,
    wl.balance_after,
    wl.created_at
FROM wallet_ledger wl
INNER JOIN users u ON wl.user_id = u.user_id
INNER JOIN currencies c ON wl.currency_id = c.currency_id
WHERE u.username IN ('trader1', 'trader2', 'trader3')
ORDER BY wl.created_at DESC
LIMIT 20;

-- ============================================
-- Notes:
-- ============================================
-- 1. user_id: Reference to users table
-- 2. currency_id: Reference to currencies table
-- 3. available: Balance có thể sử dụng để trade/withdraw
-- 4. frozen: Balance đang bị lock (pending orders, withdrawals)
-- 5. wallet_ledger: Lịch sử giao dịch cho mỗi wallet
--
-- Wallet Ledger ref_type:
-- - DEPOSIT: Nạp tiền vào
-- - WITHDRAW: Rút tiền ra
-- - ORDER: Liên quan đến order (freeze/unfreeze)
-- - TRADE: Giao dịch hoàn tất
-- - ADJUST: Điều chỉnh số dư (admin)
-- - TRANSFER: Chuyển tiền nội bộ
--
-- Direction:
-- - CREDIT: Tăng số dư (+)
-- - DEBIT: Giảm số dư (-)
--
-- ============================================
-- Usage:
-- ============================================
-- Import vào MySQL:
--   mysql -u username -p database_name < database/seed-wallets.sql
--
-- Hoặc trong MySQL client:
--   source database/seed-wallets.sql
--
-- Hoặc copy-paste vào MySQL Workbench và chạy
--
-- Lưu ý: Phải import currencies và tạo users trước
-- ============================================
