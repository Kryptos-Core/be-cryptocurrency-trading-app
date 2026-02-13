/**
 * Seed script: clear DB (trading data + users) and import seed data.
 * Seeds: currencies, users, market_pairs, wallets, wallet_ledger.
 * OHLCV is no longer seeded (provided on-demand by Price Oracle).
 *
 * Usage: npm run db:seed   or   npm run db:reset
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

dotenv.config();

const SALT_ROUNDS = 10;

function getLastInsertId(res: unknown): number {
  const rows = Array.isArray(res) ? res[0] : res;
  const row = Array.isArray(rows) ? rows[0] : rows;
  const r = row as Record<string, unknown>;
  return Number(r?.id ?? r?.['LAST_INSERT_ID()'] ?? 0);
}

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
    console.log('🗑️  Clearing DB (wallet_ledger, wallets, orders, trades, price_alerts, deposits, withdrawals, user_sessions, users, market_pairs, currencies)...');
    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    await q.query('DELETE FROM wallet_ledger');
    await q.query('DELETE FROM wallets');
    await q.query('DELETE FROM orders');
    await q.query('DELETE FROM trades');
    await q.query('DELETE FROM price_alerts');
    await q.query('DELETE FROM deposits');
    await q.query('DELETE FROM withdrawals');
    await q.query('DELETE FROM user_sessions');
    await q.query('DELETE FROM users');
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
      symbolToId[c.symbol.toUpperCase()] = getLastInsertId(res);
    }
    console.log('✅ Currencies seeded.');

    // --- Users ---
    const usersPath = path.join(seedDir, 'users.json');
    const usersData: Array<{
      email: string;
      password: string;
      first_name?: string;
      last_name?: string;
      status: 'ACTIVE' | 'BANNED' | 'PENDING';
    }> = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));

    console.log(`📥 Seeding ${usersData.length} users...`);
    const emailToUserId: Record<string, number> = {};
    for (const u of usersData) {
      const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
      // Use only columns that exist in base schema (email, password_hash, status).
      // If your DB has first_name/last_name (migration AddFirstNameLastNameToUsers), run that migration first to seed names too.
      await q.query(
        `INSERT INTO users (email, password_hash, status)
         VALUES (?, ?, ?)`,
        [u.email.toLowerCase(), passwordHash, u.status ?? 'ACTIVE'],
      );
      const res = await q.query('SELECT LAST_INSERT_ID() as id');
      emailToUserId[u.email.toLowerCase()] = getLastInsertId(res);
    }
    console.log('✅ Users seeded.');

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
      pairSymbolToId[p.symbol.toUpperCase()] = getLastInsertId(res);
    }
    console.log('✅ Market pairs seeded.');

    // --- Wallets & wallet_ledger ---
    const walletsPath = path.join(seedDir, 'wallets.json');
    const walletsData: Array<{
      user_email: string;
      balances: Array<{ symbol: string; available: string; frozen: string }>;
    }> = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));

    console.log(`📥 Seeding wallets and ledger for ${walletsData.length} users...`);
    let ledgerRefId = 1;
    for (const w of walletsData) {
      const userId = emailToUserId[w.user_email.toLowerCase()];
      if (userId == null) {
        console.warn(`Skip wallets for ${w.user_email}: user not found`);
        continue;
      }
      for (const b of w.balances) {
        const currencyId = symbolToId[b.symbol?.toUpperCase() ?? b.symbol];
        if (currencyId == null) {
          console.warn(`Skip wallet ${b.symbol} for ${w.user_email}: currency not found`);
          continue;
        }
        const available = b.available ?? '0';
        const frozen = b.frozen ?? '0';
        await q.query(
          `INSERT INTO wallets (user_id, currency_id, available, frozen)
           VALUES (?, ?, ?, ?)`,
          [userId, currencyId, available, frozen],
        );
        const res = await q.query('SELECT LAST_INSERT_ID() as id');
        const walletId = getLastInsertId(res);
        const total = (parseFloat(available) + parseFloat(frozen)).toFixed(18);
        await q.query(
          `INSERT INTO wallet_ledger (user_id, currency_id, ref_type, ref_id, direction, amount, balance_after, userUserId, currencyCurrencyId, walletWalletId)
           VALUES (?, ?, 'DEPOSIT', ?, 'CREDIT', ?, ?, ?, ?, ?)`,
          [userId, currencyId, ledgerRefId++, total, total, userId, currencyId, walletId],
        );
      }
    }
    console.log('✅ Wallets and wallet_ledger seeded.');

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
