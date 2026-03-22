/**
 * Truncate all tables in the configured MySQL database (application data only).
 * Keeps the `migrations` table so TypeORM migration history is preserved (schema unchanged).
 *
 * Usage: npm run db:clean
 *
 * Safety: blocked when NODE_ENV=production unless ALLOW_DB_CLEAN=true
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';

dotenv.config();

const SKIP_TABLES = new Set(['migrations']);

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

    const toTruncate = rows.map((r) => r.name).filter((name) => !SKIP_TABLES.has(name));

    if (toTruncate.length === 0) {
      console.log('No tables to truncate (empty schema?).');
      return;
    }

    console.log(`🗑️  Truncating ${toTruncate.length} table(s) in "${database}" (skipping: ${[...SKIP_TABLES].join(', ')})...`);

    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of toTruncate) {
      await q.query(`TRUNCATE TABLE \`${table.replace(/`/g, '``')}\``);
    }
    await q.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('✅ Database cleaned (schema + migrations history kept).');
    console.log('   Run npm run db:seed if you need default users again.');
  } catch (err) {
    console.error('db:clean failed:', err);
    process.exit(1);
  } finally {
    await q.release();
    await dataSource.destroy();
  }
}

run();
