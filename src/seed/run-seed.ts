/**
 * Seed script: clear user-related data + users, then seed users only.
 * Real currencies and market pairs are bootstrapped automatically from Binance by backend startup.
 *
 * Usage: npm run db:seed   or   npm run db:reset
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { UserRole } from '@/common/enums';
import { newUuid } from '@/common/utils/uuid.util';
import { loadEnvFilesForCli } from '@/config/load-env-files';
import { parseAndValidateSeedUsers } from '@/seed/seed-users-json.util';
import { resolveSeedUsersJsonPath } from '@/seed/seed-users-path.util';

loadEnvFilesForCli();

const SALT_ROUNDS = 10;

async function run() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
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
    console.log(
      '🗑️  Clearing user-related data (wallet_ledger, wallets, orders, trades, price_alerts, deposits, withdrawals, user_sessions, users)...',
    );
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
    await q.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Cleared.');

    const usersPath = resolveSeedUsersJsonPath({ cwd: process.cwd() });
    const usersData = parseAndValidateSeedUsers(fs.readFileSync(usersPath, 'utf-8'));
    console.log(`📄 Seed users file: ${usersPath}`);

    console.log(`📥 Seeding ${usersData.length} users...`);
    for (const u of usersData) {
      const userId = newUuid();
      const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);

      await q.query(
        `INSERT INTO users (user_id, email, password_hash, first_name, last_name, status, role)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          u.email,
          passwordHash,
          u.first_name ?? null,
          u.last_name ?? null,
          u.status,
          u.role,
        ],
      );
    }
    console.log('✅ Users seeded.');

    console.log('\n🎉 Seed done. Users imported.');
    console.log(
      '   Currencies & market pairs will sync automatically from Binance on backend startup if catalog is empty.',
    );
    const firstAdmin = usersData.find((x) => x.role === UserRole.ADMIN);
    if (firstAdmin) {
      console.log(`   Login e.g. ${firstAdmin.email} / (password from your seed file)`);
    }
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await q.release();
    await dataSource.destroy();
  }
}

run();
