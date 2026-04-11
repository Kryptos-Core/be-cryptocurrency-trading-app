/**
 * Truncate every BASE TABLE in the configured MySQL schema (all rows, all tables).
 * Includes `migrations` — TypeORM migration history is cleared; run `npm run migration:run` after if needed.
 *
 * Usage: npm run db:clean
 *
 * Safety: blocked when NODE_ENV=production unless ALLOW_DB_CLEAN=true
 */

import * as path from 'path';
import { DataSource } from 'typeorm';
import { loadEnvFilesForCli } from '@/config/load-env-files';

loadEnvFilesForCli();

async function run() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_CLEAN !== 'true') {
    console.error(
      'Refusing to clean DB: NODE_ENV=production. Set ALLOW_DB_CLEAN=true if you really intend to wipe this database.',
    );
    process.exit(1);
  }

  const database = process.env.DB_NAME;
  if (!database) {
    console.error('DB_NAME is not set (.env)');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database,
    entities: [path.join(__dirname, '../entities/*.entity{.ts,.js}')],
    migrations: [path.join(__dirname, '../migrations/*{.ts,.js}')],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  const q = dataSource.createQueryRunner();

  try {
    const rows = (await q.query(
      `SELECT TABLE_NAME AS name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?
         AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [database],
    )) as Array<{ name: string }>;

    const toTruncate = rows.map((r) => r.name);

    if (toTruncate.length === 0) {
      console.log('No tables to truncate (empty schema?).');
      return;
    }

    console.log(`🗑️  Truncating all ${toTruncate.length} table(s) in "${database}"...`);

    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of toTruncate) {
      await q.query(`TRUNCATE TABLE \`${table.replace(/`/g, '``')}\``);
    }
    await q.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('✅ All tables truncated (including migrations).');
    console.log('   Run npm run migration:run if you need migration rows back, then npm run db:seed if you use seed data.');
  } catch (err) {
    console.error('db:clean failed:', err);
    process.exit(1);
  } finally {
    await q.release();
    await dataSource.destroy();
  }
}

run();
