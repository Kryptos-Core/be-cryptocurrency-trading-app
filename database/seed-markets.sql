-- ============================================
-- Sample Data for Market Pairs Table
-- File: database/seed-markets.sql
-- Description: Import dữ liệu mẫu cho bảng market_pairs
-- ============================================

-- Lưu ý: Phải import currencies trước khi chạy script này
-- Chạy: database/seed-currencies.sql trước

-- Xóa dữ liệu cũ (nếu có)
-- Lưu ý: Chỉ chạy khi muốn reset dữ liệu
-- DELETE FROM market_pairs;

-- Disable foreign key checks tạm thời (nếu cần)
SET FOREIGN_KEY_CHECKS = 0;

-- Reset AUTO_INCREMENT (nếu muốn bắt đầu từ 1)
-- ALTER TABLE market_pairs AUTO_INCREMENT = 1;

-- ============================================
-- INSERT Sample Market Pairs
-- ============================================

-- Major Pairs với USDT (Stablecoin phổ biến nhất)
INSERT INTO market_pairs (
    base_currency_id,
    quote_currency_id,
    symbol,
    price_scale,
    amount_scale,
    min_order_amount,
    maker_fee_rate,
    taker_fee_rate,
    is_active
) VALUES
-- Top cryptocurrencies vs USDT
(
    (SELECT currency_id FROM currencies WHERE symbol = 'BTC' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'BTC/USDT',
    2,  -- price_scale: 2 decimals (e.g., 50000.00)
    6,  -- amount_scale: 6 decimals (e.g., 0.123456)
    '0.0001',  -- min_order_amount
    0.001,  -- maker_fee_rate: 0.1%
    0.001,  -- taker_fee_rate: 0.1%
    1  -- is_active
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'ETH' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'ETH/USDT',
    2,
    6,
    '0.001',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'BNB' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'BNB/USDT',
    2,
    6,
    '0.01',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'SOL' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'SOL/USDT',
    2,
    6,
    '0.01',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'XRP' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'XRP/USDT',
    4,  -- price_scale: 4 decimals (XRP giá thấp hơn)
    2,  -- amount_scale: 2 decimals
    '1',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'ADA' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'ADA/USDT',
    4,
    2,
    '1',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'DOGE' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'DOGE/USDT',
    6,  -- DOGE giá rất thấp, cần nhiều decimals
    0,  -- amount_scale: 0 decimals (số nguyên)
    '10',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'MATIC' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'MATIC/USDT',
    4,
    2,
    '1',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'AVAX' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'AVAX/USDT',
    2,
    6,
    '0.01',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'LINK' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'LINK/USDT',
    2,
    6,
    '0.01',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'UNI' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'UNI/USDT',
    2,
    6,
    '0.01',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'ATOM' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'ATOM/USDT',
    2,
    6,
    '0.01',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'LTC' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'LTC/USDT',
    2,
    6,
    '0.01',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'DOT' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDT' LIMIT 1),
    'DOT/USDT',
    2,
    6,
    '0.1',
    0.001,
    0.001,
    1
);

-- Major Pairs với USDC (Stablecoin phổ biến thứ 2)
INSERT INTO market_pairs (
    base_currency_id,
    quote_currency_id,
    symbol,
    price_scale,
    amount_scale,
    min_order_amount,
    maker_fee_rate,
    taker_fee_rate,
    is_active
) VALUES
(
    (SELECT currency_id FROM currencies WHERE symbol = 'BTC' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDC' LIMIT 1),
    'BTC/USDC',
    2,
    6,
    '0.0001',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'ETH' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'USDC' LIMIT 1),
    'ETH/USDC',
    2,
    6,
    '0.001',
    0.001,
    0.001,
    1
);

-- BTC và ETH pairs với các altcoins (Cross pairs)
INSERT INTO market_pairs (
    base_currency_id,
    quote_currency_id,
    symbol,
    price_scale,
    amount_scale,
    min_order_amount,
    maker_fee_rate,
    taker_fee_rate,
    is_active
) VALUES
(
    (SELECT currency_id FROM currencies WHERE symbol = 'ETH' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'BTC' LIMIT 1),
    'ETH/BTC',
    6,  -- BTC giá cao, cần nhiều decimals
    8,
    '0.001',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'BNB' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'BTC' LIMIT 1),
    'BNB/BTC',
    6,
    8,
    '0.01',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'SOL' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'BTC' LIMIT 1),
    'SOL/BTC',
    6,
    8,
    '0.01',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'ADA' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'BTC' LIMIT 1),
    'ADA/BTC',
    8,  -- ADA/BTC ratio rất nhỏ
    8,
    '1',
    0.001,
    0.001,
    1
),
(
    (SELECT currency_id FROM currencies WHERE symbol = 'XRP' LIMIT 1),
    (SELECT currency_id FROM currencies WHERE symbol = 'BTC' LIMIT 1),
    'XRP/BTC',
    8,
    8,
    '1',
    0.001,
    0.001,
    1
);

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- Verify Data
-- ============================================

-- Xem tổng số market pairs đã insert
SELECT COUNT(*) as total_pairs FROM market_pairs;

-- Xem danh sách active market pairs với currency names
SELECT 
    mp.pair_id,
    mp.symbol,
    bc.symbol as base_currency,
    qc.symbol as quote_currency,
    mp.price_scale,
    mp.amount_scale,
    mp.min_order_amount,
    mp.maker_fee_rate,
    mp.taker_fee_rate,
    mp.is_active,
    mp.created_at
FROM market_pairs mp
INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
WHERE mp.is_active = 1
ORDER BY mp.symbol;

-- Xem pairs theo quote currency
SELECT 
    qc.symbol as quote_currency,
    COUNT(*) as pair_count,
    GROUP_CONCAT(mp.symbol ORDER BY mp.symbol SEPARATOR ', ') as pairs
FROM market_pairs mp
INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
WHERE mp.is_active = 1
GROUP BY qc.symbol
ORDER BY pair_count DESC;

-- Xem inactive pairs (nếu có)
SELECT 
    mp.pair_id,
    mp.symbol,
    bc.symbol as base_currency,
    qc.symbol as quote_currency,
    mp.is_active
FROM market_pairs mp
INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
WHERE mp.is_active = 0
ORDER BY mp.symbol;

-- ============================================
-- Notes:
-- ============================================
-- 1. base_currency_id: Currency được trade (BTC, ETH, ...)
-- 2. quote_currency_id: Currency dùng để định giá (USDT, USDC, BTC, ...)
-- 3. symbol: Format BASE/QUOTE (e.g., BTC/USDT)
-- 4. price_scale: Số chữ số thập phân cho giá
--    - BTC/USDT: 2 (50000.00)
--    - XRP/USDT: 4 (0.5234)
--    - DOGE/USDT: 6 (0.123456)
--    - ETH/BTC: 6 (0.065432)
-- 5. amount_scale: Số chữ số thập phân cho số lượng
--    - Major coins: 6-8 decimals
--    - Low value coins: 0-2 decimals
-- 6. min_order_amount: Số lượng tối thiểu cho một order
-- 7. maker_fee_rate: Phí cho maker (người tạo order) - default 0.1%
-- 8. taker_fee_rate: Phí cho taker (người match order) - default 0.1%
-- 9. is_active: Pair có active không (1 = active, 0 = inactive)
--
-- ============================================
-- Common Market Pair Configurations:
-- ============================================
-- High-value pairs (BTC, ETH):
--   - price_scale: 2
--   - amount_scale: 6-8
--   - min_order_amount: 0.0001 - 0.001
--
-- Mid-value pairs (BNB, SOL, AVAX):
--   - price_scale: 2
--   - amount_scale: 6
--   - min_order_amount: 0.01
--
-- Low-value pairs (XRP, ADA, DOGE):
--   - price_scale: 4-6
--   - amount_scale: 0-2
--   - min_order_amount: 1-10
--
-- Cross pairs (ETH/BTC, ALT/BTC):
--   - price_scale: 6-8 (ratio nhỏ)
--   - amount_scale: 8
--   - min_order_amount: 0.001 - 1
--
-- ============================================
-- Usage:
-- ============================================
-- Import vào MySQL:
--   mysql -u username -p database_name < database/seed-markets.sql
--
-- Hoặc trong MySQL client:
--   source database/seed-markets.sql
--
-- Hoặc copy-paste vào MySQL Workbench và chạy
--
-- Lưu ý: Phải import currencies trước:
--   source database/seed-currencies.sql
-- ============================================
