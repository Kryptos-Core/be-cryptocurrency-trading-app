/**
 * Delete all rows from every BASE TABLE in the configured PostgreSQL schema.
 * Includes `migrations` — TypeORM migration history is cleared; run `npm run migration:run` after if needed.
 *
 * Usage: npm run db:clean
 *
 * Safety: blocked when NODE_ENV=production unless ALLOW_DB_CLEAN=true
 */

import { DataSource } from 'typeorm';
import { loadEnvFilesForCli } from '@/config/load-env-files';
import { typeormEntityGlobPaths, typeormMigrationFilePaths } from '@/config/typeorm-entity-glob-paths';

loadEnvFilesForCli();

async function run() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_CLEAN !== 'true') {
    console.error(
      'Refusing to clean DB: NODE_ENV=production. Set ALLOW_DB_CLEAN=true if you really intend to wipe this database.',
    );
    process.exit(1);
  }

  const database = process.env.CORE_DB_NAME || process.env.DB_NAME;
  if (!database) {
    console.error('CORE_DB_NAME|DB_NAME is not set (.env.<NODE_ENV>, e.g. .env.development)');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.CORE_DB_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.CORE_DB_PORT || process.env.DB_PORT || '5432', 10),
    username: process.env.CORE_DB_USERNAME || process.env.DB_USERNAME,
    password: process.env.CORE_DB_PASSWORD || process.env.DB_PASSWORD,
    database,
    entities: typeormEntityGlobPaths(__dirname),
    migrations: typeormMigrationFilePaths(__dirname),
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  const q = dataSource.createQueryRunner();

  try {
    const rows = (await q.query(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    )) as Array<{ name: string }>;

    const toTruncate = rows.map((r) => r.name);

    if (toTruncate.length === 0) {
      console.log('No tables to truncate (empty schema?).');
      return;
    }

    console.log(`🗑️  Clearing all ${toTruncate.length} table(s) in "${database}"...`);

    for (const table of toTruncate) {
      const escapedTable = table.replace(/"/g, '""');
      await q.query(`TRUNCATE TABLE "${escapedTable}" RESTART IDENTITY CASCADE`);
    }

    console.log('✅ All table data cleared (including migrations).');
    console.log(
      '   Run npm run migration:run if you need migration rows back, then npm run db:seed if you use seed data.',
    );
  } catch (err) {
    console.error('db:clean failed:', err);
    process.exit(1);
  } finally {
    await q.release();
    await dataSource.destroy();
  }
}

run();
