/**
 * Seed script: clear user-related data + users, then seed users only.
 * Real currencies and market pairs are bootstrapped automatically from Binance by backend startup.
 * Uses CORE_DB_* (with DB_* fallback) and PostgreSQL DataSource.
 *
 * Usage: npm run db:seed   or   npm run db:reset
 */

import * as fs from 'node:fs';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { UserRole } from '@/common/enums';
import { newUuid } from '@/common/utils/uuid.util';
import { loadEnvFilesForCli } from '@/config/load-env-files';
import { typeormEntityGlobPaths, typeormMigrationFilePaths } from '@/config/typeorm-entity-glob-paths';
import { parseAndValidateSeedUsers } from '@/seed/seed-users-json.util';
import { resolveSeedUsersJsonPath } from '@/seed/seed-users-path.util';

loadEnvFilesForCli();

const SALT_ROUNDS = 10;

function resolveCoreDb() {
  return {
    host: process.env.CORE_DB_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.CORE_DB_PORT || process.env.DB_PORT || '5432', 10),
    username: process.env.CORE_DB_USERNAME || process.env.DB_USERNAME,
    password: process.env.CORE_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.CORE_DB_NAME || process.env.DB_NAME,
  };
}

async function run() {
  const coreDb = resolveCoreDb();

  const dataSource = new DataSource({
    type: 'postgres',
    host: coreDb.host,
    port: coreDb.port,
    username: coreDb.username,
    password: coreDb.password,
    database: coreDb.database,
    entities: typeormEntityGlobPaths(__dirname),
    migrations: typeormMigrationFilePaths(__dirname),
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  const q = dataSource.createQueryRunner();

  const truncateIfExists = async (tableName: string): Promise<void> => {
    const rows = (await q.query(`SELECT to_regclass($1) AS table_name`, [tableName])) as Array<{
      table_name: string | null;
    }>;
    if (rows[0]?.table_name) {
      await q.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
    }
  };

  try {
    console.log(
      '🗑️  Clearing user-related data (wallet_ledger, wallets, orders, trades, deposits, withdrawals, users, plus optional legacy tables)...',
    );

    // Required tables in the current Postgres baseline.
    await truncateIfExists('wallet_ledger');
    await truncateIfExists('wallets');
    await truncateIfExists('orders');
    await truncateIfExists('trades');
    await truncateIfExists('deposits');
    await truncateIfExists('withdrawals');
    await truncateIfExists('users');

    // Optional legacy tables kept for backward-compatible local reset scripts.
    await truncateIfExists('price_alerts');
    await truncateIfExists('user_sessions');

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
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
