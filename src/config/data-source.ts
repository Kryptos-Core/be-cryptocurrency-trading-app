import { DataSource } from 'typeorm';
import { loadEnvFilesForCli } from './load-env-files';
import { typeormEntityGlobPaths, typeormMigrationFilePaths } from './typeorm-entity-glob-paths';

loadEnvFilesForCli();

function ensurePresent(value: string | undefined, key: string): string {
  if (value == null || !value.trim()) {
    throw new Error(`TypeORM CLI: thiếu biến môi trường: ${key}`);
  }
  return value;
}

function resolveCoreDbEnv(): {
  host: string;
  port: string;
  username?: string;
  password?: string;
  database?: string;
} {
  const host = process.env.CORE_DB_HOST?.trim() || process.env.DB_HOST?.trim() || '127.0.0.1';
  const port = process.env.CORE_DB_PORT?.trim() || process.env.DB_PORT?.trim() || '5432';
  const username = process.env.CORE_DB_USERNAME?.trim() || process.env.DB_USERNAME?.trim();
  const password = process.env.CORE_DB_PASSWORD?.trim() || process.env.DB_PASSWORD?.trim();
  const database = process.env.CORE_DB_NAME?.trim() || process.env.DB_NAME?.trim();
  return { host, port, username, password, database };
}

function assertDbEnvForCli(): {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
} {
  const core = resolveCoreDbEnv();
  const username = core.username;
  const password = core.password;
  const database = core.database;
  const missing: string[] = [];

  if (!username) missing.push('CORE_DB_USERNAME|DB_USERNAME');
  if (!password) missing.push('CORE_DB_PASSWORD|DB_PASSWORD');
  if (!database) missing.push('CORE_DB_NAME|DB_NAME');

  if (missing.length > 0) {
    throw new Error(
      `TypeORM CLI: thiếu biến môi trường: ${missing.join(', ')}. ` +
        'Với `npm run migration:*`, cần file `.env.<NODE_ENV>` (mặc định CLI: `NODE_ENV=development` → `.env.development`).',
    );
  }

  return {
    host: core.host,
    port: core.port,
    username: ensurePresent(username, 'CORE_DB_USERNAME|DB_USERNAME'),
    password: ensurePresent(password, 'CORE_DB_PASSWORD|DB_PASSWORD'),
    database: ensurePresent(database, 'CORE_DB_NAME|DB_NAME'),
  };
}

const coreDb = assertDbEnvForCli();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: coreDb.host,
  port: parseInt(coreDb.port, 10),
  username: coreDb.username,
  password: coreDb.password,
  database: coreDb.database,
  entities: typeormEntityGlobPaths(__dirname),
  migrations: typeormMigrationFilePaths(__dirname),
  synchronize: false, // Always false for migrations
  logging: true,
  extra: {
    statement_timeout: 60_000,
    idle_in_transaction_session_timeout: 60_000,
  },
});
