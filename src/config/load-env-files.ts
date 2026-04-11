import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Load `.env` then `.env.${NODE_ENV}` (latter overrides) for TypeORM CLI / seed scripts.
 *
 * - `npm run migration:*`, `db:seed`, `db:clean` set `NODE_ENV=development` so `.env.development` is applied (see package.json).
 * - Staging DB: `cross-env NODE_ENV=staging npm run typeorm -- migration:run -d src/config/data-source.ts`
 */
export function loadEnvFilesForCli(cwd: string = process.cwd()): void {
  dotenv.config({ path: path.join(cwd, '.env') });
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv) {
    dotenv.config({ path: path.join(cwd, `.env.${nodeEnv}`), override: true });
  }
}

/**
 * Paths for Nest `ConfigModule.forRoot({ envFilePath })` — later entries override earlier.
 */
export function nestEnvFilePaths(cwd: string = process.cwd()): string[] {
  const nodeEnv = process.env.NODE_ENV;
  if (!nodeEnv) {
    return [path.join(cwd, '.env')];
  }
  return [path.join(cwd, '.env'), path.join(cwd, `.env.${nodeEnv}`)];
}
