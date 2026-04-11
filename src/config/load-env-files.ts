import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Load `.env` then `.env.${NODE_ENV}` (latter overrides) for TypeORM CLI / seed scripts.
 * Set NODE_ENV before import (e.g. `cross-env NODE_ENV=staging npm run migration:run`).
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
