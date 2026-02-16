/**
 * Seed script: clear DB (trading data + users) and import seed data.
 * UUID v7: all IDs are generated with newUuid() (currencies, users, market_pairs, wallets, wallet_ledger).
 *
 * Usage: npm run db:seed   or   npm run db:reset
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { newUuid } from '@/common/utils/uuid.util';

dotenv.config();

const SALT_ROUNDS = 10;

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

    // --- Currencies (UUID) ---
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
    const symbolToId: Record<string, string> = {};
    for (const c of currencies) {
      const currencyId = newUuid();
      await q.query(
        `INSERT INTO currencies (currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          currencyId,
          c.symbol.toUpperCase(),
          c.name,
          c.precision_scale,
          c.min_withdraw,
          c.is_tradable ? 1 : 0,
          c.is_active ? 1 : 0,
        ],
      );
      symbolToId[c.symbol.toUpperCase()] = currencyId;
    }
    console.log('✅ Currencies seeded.');

    // --- Users (UUID) ---
    const usersPath = path.join(seedDir, 'users.json');
    const usersData: Array<{
      email: string;
      password: string;
      first_name?: string;
      last_name?: string;
      status: 'ACTIVE' | 'BANNED' | 'PENDING';
    }> = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));

    console.log(`📥 Seeding ${usersData.length} users...`);
    const emailToUserId: Record<string, string> = {};
    for (const u of usersData) {
      const userId = newUuid();
      const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
      await q.query(
        `INSERT INTO users (user_id, email, password_hash, first_name, last_name, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          u.email.toLowerCase(),
          passwordHash,
          u.first_name ?? null,
          u.last_name ?? null,
          u.status ?? 'ACTIVE',
        ],
      );
      emailToUserId[u.email.toLowerCase()] = userId;
    }
    console.log('✅ Users seeded.');

    // --- Market pairs (UUID) ---
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
    for (const p of pairs) {
      const baseId = symbolToId[p.base_symbol];
      const quoteId = symbolToId[p.quote_symbol];
      if (!baseId || !quoteId) {
        console.warn(`Skip pair ${p.symbol}: missing currency ${p.base_symbol} or ${p.quote_symbol}`);
        continue;
      }
      const pairId = newUuid();
      await q.query(
        `INSERT INTO market_pairs (pair_id, base_currency_id, quote_currency_id, symbol, price_scale, amount_scale, min_order_amount, maker_fee_rate, taker_fee_rate, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0.001, 0.001, 1)`,
        [pairId, baseId, quoteId, p.symbol.toUpperCase(), p.price_scale, p.amount_scale, p.min_order_amount],
      );
    }
    console.log('✅ Market pairs seeded.');

    // --- Wallets & wallet_ledger (UUID) ---
    const walletsPath = path.join(seedDir, 'wallets.json');
    const walletsData: Array<{
      user_email: string;
      balances: Array<{ symbol: string; available: string; frozen: string }>;
    }> = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));

    console.log(`📥 Seeding wallets and ledger for ${walletsData.length} users...`);
    for (const w of walletsData) {
      const userId = emailToUserId[w.user_email.toLowerCase()];
      if (!userId) {
        console.warn(`Skip wallets for ${w.user_email}: user not found`);
        continue;
      }
      for (const b of w.balances) {
        const currencyId = symbolToId[b.symbol?.toUpperCase() ?? b.symbol];
        if (!currencyId) {
          console.warn(`Skip wallet ${b.symbol} for ${w.user_email}: currency not found`);
          continue;
        }
        const available = b.available ?? '0';
        const frozen = b.frozen ?? '0';
        const walletId = newUuid();
        await q.query(
          `INSERT INTO wallets (wallet_id, user_id, currency_id, available, frozen)
           VALUES (?, ?, ?, ?, ?)`,
          [walletId, userId, currencyId, available, frozen],
        );
        const total = (parseFloat(available) + parseFloat(frozen)).toFixed(18);
        const ledgerId = newUuid();
        const refId = newUuid();
        await q.query(
          `INSERT INTO wallet_ledger (ledger_id, user_id, currency_id, wallet_id, ref_type, ref_id, direction, amount, balance_after)
           VALUES (?, ?, ?, ?, 'DEPOSIT', ?, 'CREDIT', ?, ?)`,
          [ledgerId, userId, currencyId, walletId, refId, total, total],
        );
      }
    }
    console.log('✅ Wallets and wallet_ledger seeded.');

    console.log('\n🎉 Seed done. DB reset and data imported.');
    console.log('   Login with e.g. admin@example.com / Admin@123! to get a JWT with UUID user id.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await q.release();
    await dataSource.destroy();
  }
}

run();
