/**
 * Seed script: clear DB (trading data) and import seed data.
 * Seed format matches WebSocket message shape (OHLC = OHLCMessage, markets = pair symbol).
 *
 * Usage: npm run db:seed   or   npm run db:reset
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

dotenv.config();

const INTERVAL_SEC: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

async function run() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [path.join(__dirname, '../entities/*.entity{.ts,.js}')],
    migrations: [path.join(__dirname, '../migrations/*{.ts,.js}')],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  const q = dataSource.createQueryRunner();

  try {
    console.log('🗑️  Clearing DB (ohlcv, trades, orders, price_alerts, market_pairs, currencies)...');
    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    await q.query('DELETE FROM ohlcv');
    await q.query('DELETE FROM trades');
    await q.query('DELETE FROM orders');
    await q.query('DELETE FROM price_alerts');
    await q.query('DELETE FROM market_pairs');
    await q.query('DELETE FROM currencies');
    await q.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ DB cleared.');

    const seedDir = path.join(process.cwd(), 'src', 'seed', 'data');

    // --- Currencies ---
    const currenciesPath = path.join(seedDir, 'currencies.json');
    const currencies: Array<{
      symbol: string;
      name: string;
      precision_scale: number;
      min_withdraw: string;
      is_tradable: boolean;
      is_active: boolean;
    }> = JSON.parse(fs.readFileSync(currenciesPath, 'utf-8'));

    console.log(`📥 Seeding ${currencies.length} currencies...`);
    const symbolToId: Record<string, number> = {};
    for (const c of currencies) {
      await q.query(
        `INSERT INTO currencies (symbol, name, precision_scale, min_withdraw, is_tradable, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          c.symbol.toUpperCase(),
          c.name,
          c.precision_scale,
          c.min_withdraw,
          c.is_tradable ? 1 : 0,
          c.is_active ? 1 : 0,
        ],
      );
      const res = await q.query('SELECT LAST_INSERT_ID() as id');
      const rows = Array.isArray(res) ? res[0] : res;
      const row = Array.isArray(rows) ? rows[0] : rows;
      symbolToId[c.symbol.toUpperCase()] = Number((row as any)?.id ?? (row as any)?.['LAST_INSERT_ID()']);
    }
    console.log('✅ Currencies seeded.');

    // --- Market pairs ---
    const pairsPath = path.join(seedDir, 'market-pairs.json');
    const pairs: Array<{
      base_symbol: string;
      quote_symbol: string;
      symbol: string;
      price_scale: number;
      amount_scale: number;
      min_order_amount: string;
    }> = JSON.parse(fs.readFileSync(pairsPath, 'utf-8'));

    console.log(`📥 Seeding ${pairs.length} market pairs...`);
    const pairSymbolToId: Record<string, number> = {};
    for (const p of pairs) {
      const baseId = symbolToId[p.base_symbol];
      const quoteId = symbolToId[p.quote_symbol];
      if (baseId == null || quoteId == null) {
        console.warn(`Skip pair ${p.symbol}: missing currency ${p.base_symbol} or ${p.quote_symbol}`);
        continue;
      }
      await q.query(
        `INSERT INTO market_pairs (base_currency_id, quote_currency_id, symbol, price_scale, amount_scale, min_order_amount, maker_fee_rate, taker_fee_rate, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 0.001, 0.001, 1)`,
        [baseId, quoteId, p.symbol.toUpperCase(), p.price_scale, p.amount_scale, p.min_order_amount],
      );
      const res = await q.query('SELECT LAST_INSERT_ID() as id');
      const rows = Array.isArray(res) ? res[0] : res;
      const row = Array.isArray(rows) ? rows[0] : rows;
      pairSymbolToId[p.symbol.toUpperCase()] = Number((row as any)?.id ?? (row as any)?.['LAST_INSERT_ID()']);
    }
    console.log('✅ Market pairs seeded.');

    // --- OHLCV (WebSocket-style: symbol, interval, open_time ms, open, high, low, close, volume) ---
    const ohlcvPath = path.join(seedDir, 'ohlcv.json');
    const ohlcvRows: Array<{
      symbol: string;
      interval: string;
      open_time: number;
      close_time: number;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
      quote_volume?: string;
      trades_count?: number;
      is_closed?: boolean;
    }> = JSON.parse(fs.readFileSync(ohlcvPath, 'utf-8'));

    console.log(`📥 Seeding ${ohlcvRows.length} OHLCV candles...`);
    const batch: Array<{ pairId: number; intervalSec: number; openTime: Date; open: string; high: string; low: string; close: string; volume: string }> = [];
    for (const row of ohlcvRows) {
      const pairId = pairSymbolToId[row.symbol?.toUpperCase() ?? row.symbol];
      if (pairId == null) {
        console.warn(`Skip OHLCV ${row.symbol} ${row.interval}: pair not found`);
        continue;
      }
      const intervalSec = INTERVAL_SEC[row.interval] ?? 60;
      const openTime = new Date(row.open_time);
      batch.push({
        pairId,
        intervalSec,
        openTime,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume ?? '0',
      });
    }

    if (batch.length > 0) {
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const sql = `INSERT INTO ohlcv (pair_id, interval_sec, open_time, \`open\`, high, low, \`close\`, volume)
VALUES ${placeholders}
ON DUPLICATE KEY UPDATE high = VALUES(high), low = VALUES(low), \`close\` = VALUES(\`close\`), volume = VALUES(volume)`;
      const params = batch.flatMap((r) => [r.pairId, r.intervalSec, r.openTime, r.open, r.high, r.low, r.close, r.volume]);
      await q.query(sql, params);
    }
    console.log('✅ OHLCV seeded.');

    console.log('\n🎉 Seed done. DB reset and data imported.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await q.release();
    await dataSource.destroy();
  }
}

run();
