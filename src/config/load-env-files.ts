import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

/**
 * When `NODE_ENV` is unset, treat as `development` so local runs match `npm run start:dev`
 * (which always sets `NODE_ENV` via cross-env).
 */
const FALLBACK_NODE_ENV_FOR_ENV_FILE = 'development';

function nodeEnvForEnvFile(): string {
  const v = process.env.NODE_ENV?.trim();
  return v || FALLBACK_NODE_ENV_FOR_ENV_FILE;
}

/**
 * Load exactly `.env.${NODE_ENV}` for TypeORM CLI / seed scripts.
 *
 * - `npm run migration:*`, `db:seed`, `db:clean` set `NODE_ENV=development` → `.env.development`.
 * - Staging DB: `cross-env NODE_ENV=staging npm run typeorm -- migration:run -d src/config/data-source.ts`
 */
export function loadEnvFilesForCli(cwd: string = process.cwd()): void {
  const nodeEnv = nodeEnvForEnvFile();
  dotenv.config({ path: path.join(cwd, `.env.${nodeEnv}`) });
}

/**
 * Paths for Nest `ConfigModule.forRoot({ envFilePath })` — one file per environment.
 * In test, allow fallback to `.env.development` when `.env.test` is absent.
 */
export function nestEnvFilePaths(cwd: string = process.cwd()): string[] {
  const nodeEnv = nodeEnvForEnvFile();
  const primary = path.join(cwd, `.env.${nodeEnv}`);

  if (nodeEnv === 'test') {
    const fallback = path.join(cwd, '.env.development');
    return existsSync(fallback) ? [primary, fallback] : [primary];
  }

  return [primary];
}
