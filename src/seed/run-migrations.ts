/**
 * Run migrations with verbose SQL logging.
 * Uses DataSource directly (not TypeORM CLI) so every SQL statement is printed.
 *
 * Usage: npm run db:migrate
 *   (via the "db:migrate" script in package.json)
 *
 * Logs:
 *   - Database connection info
 *   - Each migration file name before executing
 *   - Each SQL statement executed (prepared by TypeORM)
 *   - Migration success/failure summary
 */

import { DataSource } from 'typeorm';
import { loadEnvFilesForCli } from '@/config/load-env-files';
import {
  typeormEntityGlobPaths,
  typeormMigrationFilePaths,
} from '@/config/typeorm-entity-glob-paths';

loadEnvFilesForCli();

function resolveCoreDb() {
  return {
    host: process.env.CORE_DB_HOST?.trim() || process.env.DB_HOST?.trim() || '127.0.0.1',
    port: parseInt(process.env.CORE_DB_PORT?.trim() || process.env.DB_PORT?.trim() || '5432', 10),
    username: process.env.CORE_DB_USERNAME?.trim() || process.env.DB_USERNAME?.trim(),
    password: process.env.CORE_DB_PASSWORD?.trim() || process.env.DB_PASSWORD?.trim(),
    database: process.env.CORE_DB_NAME?.trim() || process.env.DB_NAME?.trim(),
  };
}

async function run() {
  const coreDb = resolveCoreDb();

  if (!coreDb.username || !coreDb.password || !coreDb.database) {
    console.error(
      '\n[X] TypeORM Migration: thiếu biến môi trường.\n' +
        '    Cần: CORE_DB_USERNAME|DB_USERNAME, CORE_DB_PASSWORD|DB_PASSWORD, CORE_DB_NAME|DB_NAME\n' +
        '    File .env.development phải tồn tại và được load đúng.\n',
    );
    process.exit(1);
  }

  console.log('\n=============================[ Migration Run ]=============================');
  console.log(`  Driver    : postgres`);
  console.log(`  Host      : ${coreDb.host}`);
  console.log(`  Port      : ${coreDb.port}`);
  console.log(`  Database  : ${coreDb.database}`);
  console.log(`  Username  : ${coreDb.username}`);
  console.log('========================================================================\n');

  const dataSource = new DataSource({
    type: 'postgres',
    host: coreDb.host,
    port: coreDb.port,
    username: coreDb.username,
    password: coreDb.password,
    database: coreDb.database,
    entities: typeormEntityGlobPaths(__dirname),
    migrations: typeormMigrationFilePaths(__dirname),
    migrationsTransactionMode: 'each',
    logging: ['query', 'schema'],
    extra: {
      statement_timeout: 60_000,
      idle_in_transaction_session_timeout: 60_000,
    },
  });

  try {
    await dataSource.initialize();
    console.log('[+] DataSource initialized\n');

    const migrations = await dataSource.runMigrations({
      transaction: 'each',
    });

    if (migrations.length === 0) {
      console.log('[=] No pending migrations.\n');
    } else {
      console.log(`\n[OK] ${migrations.length} migration(s) executed successfully:`);
      for (const m of migrations) {
        console.log(`     - ${m.name}`);
      }
      console.log('');
    }

    await dataSource.destroy();
    console.log('[+] DataSource closed. Done.\n');
    process.exit(0);
  } catch (error) {
    console.error('\n[X] Migration FAILED:');
    console.error(error instanceof Error ? error.message : error);
    await dataSource.destroy().catch(() => {});
    process.exit(1);
  }
}

run();
