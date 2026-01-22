-- ============================================
-- Sample Data for Currencies Table
-- File: database/seed-currencies.sql
-- Description: Import dữ liệu mẫu cho bảng currencies
-- ============================================

-- Xóa dữ liệu cũ (nếu có)
-- Lưu ý: Chỉ chạy khi muốn reset dữ liệu
-- DELETE FROM currencies;

-- Disable foreign key checks tạm thời (nếu cần)
SET FOREIGN_KEY_CHECKS = 0;

-- Reset AUTO_INCREMENT (nếu muốn bắt đầu từ 1)
-- ALTER TABLE currencies AUTO_INCREMENT = 1;

-- ============================================
-- INSERT Sample Currencies
-- ============================================

-- Major Cryptocurrencies (Top 20 by Market Cap)
INSERT INTO currencies (symbol, name, precision_scale, min_withdraw, is_tradable, is_active) VALUES
-- Bitcoin & Major Coins
('BTC', 'Bitcoin', 8, '0.001', 1, 1),
('ETH', 'Ethereum', 8, '0.01', 1, 1),
('BNB', 'Binance Coin', 8, '0.1', 1, 1),
('SOL', 'Solana', 8, '0.1', 1, 1),
('XRP', 'Ripple', 6, '10', 1, 1),
('ADA', 'Cardano', 8, '1', 1, 1),
('DOT', 'Polkadot', 8, '1', 1, 1),
('DOGE', 'Dogecoin', 8, '10', 1, 1),
('MATIC', 'Polygon', 8, '1', 1, 1),
('AVAX', 'Avalanche', 8, '0.1', 1, 1),

-- Stablecoins
('USDT', 'Tether', 6, '10', 1, 1),
('USDC', 'USD Coin', 6, '10', 1, 1),
('BUSD', 'Binance USD', 6, '10', 1, 1),
('DAI', 'Dai', 6, '10', 1, 1),

-- DeFi Tokens
('UNI', 'Uniswap', 8, '0.1', 1, 1),
('LINK', 'Chainlink', 8, '0.1', 1, 1),
('AAVE', 'Aave', 8, '0.01', 1, 1),
('SUSHI', 'SushiSwap', 8, '1', 1, 1),
('COMP', 'Compound', 8, '0.01', 1, 1),
('MKR', 'Maker', 8, '0.01', 1, 1),

-- Layer 1 & Layer 2
('ATOM', 'Cosmos', 8, '0.1', 1, 1),
('ALGO', 'Algorand', 8, '1', 1, 1),
('NEAR', 'NEAR Protocol', 8, '0.1', 1, 1),
('FTM', 'Fantom', 8, '1', 1, 1),
('ARB', 'Arbitrum', 8, '0.1', 1, 1),
('OP', 'Optimism', 8, '0.1', 1, 1),

-- Meme Coins & Others
('SHIB', 'Shiba Inu', 8, '1000000', 1, 1),
('PEPE', 'Pepe', 8, '1000000', 1, 1),
('FLOKI', 'FLOKI', 8, '100000', 1, 1),

-- Gaming & Metaverse
('SAND', 'The Sandbox', 8, '1', 1, 1),
('MANA', 'Decentraland', 8, '1', 1, 1),
('AXS', 'Axie Infinity', 8, '0.1', 1, 1),
('GALA', 'Gala', 8, '10', 1, 1),

-- Exchange Tokens
('FTT', 'FTX Token', 8, '0.1', 1, 0), -- Inactive (FTX collapsed)
('HT', 'Huobi Token', 8, '0.1', 1, 1),
('OKB', 'OKB', 8, '0.1', 1, 1),

-- Privacy Coins
('XMR', 'Monero', 8, '0.01', 1, 1),
('ZEC', 'Zcash', 8, '0.01', 1, 1),

-- Additional Popular Coins
('LTC', 'Litecoin', 8, '0.01', 1, 1),
('BCH', 'Bitcoin Cash', 8, '0.001', 1, 1),
('ETC', 'Ethereum Classic', 8, '0.1', 1, 1),
('TRX', 'TRON', 6, '10', 1, 1),
('EOS', 'EOS', 4, '1', 1, 1),
('XLM', 'Stellar', 7, '10', 1, 1),
('VET', 'VeChain', 8, '10', 1, 1),
('ICP', 'Internet Computer', 8, '0.1', 1, 1),
('FIL', 'Filecoin', 8, '0.1', 1, 1),
('THETA', 'Theta Network', 8, '1', 1, 1),
('HBAR', 'Hedera', 8, '1', 1, 1),
('EGLD', 'Elrond', 8, '0.01', 1, 1),
('FLOW', 'Flow', 8, '1', 1, 1),
('TIA', 'Celestia', 8, '0.1', 1, 1),
('INJ', 'Injective', 8, '0.1', 1, 1),
('SEI', 'Sei', 8, '1', 1, 1),
('SUI', 'Sui', 8, '0.1', 1, 1),
('APT', 'Aptos', 8, '0.1', 1, 1),
('TON', 'Toncoin', 8, '0.1', 1, 1),
('BLUR', 'Blur', 8, '1', 1, 1),
('JTO', 'Jito', 8, '0.1', 1, 1),
('PYTH', 'Pyth Network', 8, '1', 1, 1),
('WLD', 'Worldcoin', 8, '1', 1, 1),
('ORDI', 'ORDI', 8, '0.01', 1, 1),
('BONK', 'Bonk', 8, '1000000', 1, 1);

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- Verify Data
-- ============================================

-- Xem tổng số currencies đã insert
SELECT COUNT(*) as total_currencies FROM currencies;

-- Xem danh sách currencies active và tradable
SELECT 
    currency_id,
    symbol,
    name,
    precision_scale,
    min_withdraw,
    is_tradable,
    is_active
FROM currencies
WHERE is_active = 1 AND is_tradable = 1
ORDER BY currency_id;

-- Xem currencies inactive
SELECT 
    currency_id,
    symbol,
    name,
    is_active,
    is_tradable
FROM currencies
WHERE is_active = 0
ORDER BY currency_id;

-- ============================================
-- Notes:
-- ============================================
-- 1. precision_scale: Số chữ số thập phân (0-18)
--    - BTC, ETH: 8 decimals
--    - USDT, USDC: 6 decimals (stablecoins thường 6)
--    - XRP: 6 decimals
--    - EOS: 4 decimals
--
-- 2. min_withdraw: Số tiền tối thiểu có thể rút
--    - Major coins: 0.001 - 0.1
--    - Stablecoins: 10
--    - Meme coins với giá thấp: 1000000+
--
-- 3. is_tradable: Có thể trade không
--    - 1 = Có thể trade
--    - 0 = Không thể trade (chỉ có thể nạp/rút)
--
-- 4. is_active: Currency có active không
--    - 1 = Active (hiển thị và sử dụng được)
--    - 0 = Inactive (ẩn, không sử dụng được)
--
-- 5. Symbol phải UPPERCASE và UNIQUE
--
-- ============================================
-- Usage:
-- ============================================
-- Import vào MySQL:
--   mysql -u username -p database_name < database/seed-currencies.sql
--
-- Hoặc trong MySQL client:
--   source database/seed-currencies.sql
--
-- Hoặc copy-paste vào MySQL Workbench và chạy
-- ============================================
