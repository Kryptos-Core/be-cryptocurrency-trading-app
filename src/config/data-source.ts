import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { loadEnvFilesForCli } from './load-env-files';

loadEnvFilesForCli();

function assertDbEnvForCli(): void {
  const missing: string[] = [];
  for (const key of ['DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'] as const) {
    if (!process.env[key]?.trim()) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(
      `TypeORM CLI: thiếu biến môi trường: ${missing.join(', ')}. ` +
        'Với `npm run migration:*`, cần `.env` + `.env.development` (hoặc đặt NODE_ENV khác và file `.env.<NODE_ENV>` tương ứng).',
    );
  }
}

assertDbEnvForCli();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [path.join(__dirname, '../entities/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, '../migrations/*{.ts,.js}')],
  synchronize: false, // Always false for migrations
  logging: true,
  /** Tránh `PROTOCOL_CONNECTION_LOST` sớm khi MySQL/Docker trên Windows khởi động chậm. */
  extra: {
    connectTimeout: 60_000,
  },
});
