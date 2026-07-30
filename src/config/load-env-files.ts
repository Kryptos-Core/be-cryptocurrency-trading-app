import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

/**
 * When `NODE_ENV` is unset, treat as `development` so local runs match `npm run start:dev`
 * (which always sets `NODE_ENV` via cross-env).
 */
const FALLBACK_NODE_ENV_FOR_ENV_FILE = 'development';

/**
 * Env-file suffix per logical environment.
 *
 * Production historically used `.env.production` (paired with `NODE_ENV=production`).
 * After the file-naming cleanup the production file is `.env.prod`, but
 * `NODE_ENV` stays `production` for backward compatibility with framework code
 * and tooling (NestJS, npm scripts, CI). Keep this map as the single source of
 * truth for the suffix when the names diverge.
 */
const ENV_FILE_SUFFIX_OVERRIDES: Readonly<Record<string, string>> = {
  production: 'prod',
};

/**
 * Resolve the env-file suffix for a logical `NODE_ENV` value. Falls back to the
 * raw `NODE_ENV` value when no override exists.
 */
export function envFileSuffixForNodeEnv(nodeEnv: string): string {
  return ENV_FILE_SUFFIX_OVERRIDES[nodeEnv] ?? nodeEnv;
}

function nodeEnvForEnvFile(): string {
  const v = process.env.NODE_ENV?.trim();
  return v || FALLBACK_NODE_ENV_FOR_ENV_FILE;
}

/**
 * Load exactly `.env.${envFileSuffix}` for TypeORM CLI / seed scripts.
 *
 * - `npm run migration:*`, `db:seed`, `db:clean` set `NODE_ENV=development` → `.env.development`.
 * - Staging DB: `cross-env NODE_ENV=staging npm run typeorm -- migration:run -d src/config/data-source.ts`
 * - Production (after file rename): `NODE_ENV=production` → `.env.prod`.
 */
export function loadEnvFilesForCli(cwd: string = process.cwd()): void {
  const nodeEnv = nodeEnvForEnvFile();
  const suffix = envFileSuffixForNodeEnv(nodeEnv);
  dotenv.config({ path: path.join(cwd, `.env.${suffix}`) });
}

/**
 * Paths for Nest `ConfigModule.forRoot({ envFilePath })` — one file per environment.
 *
 * When `NODE_ENV=production`, prefer the new short name `.env.prod` but fall back to
 * `.env.production` for any deployment that hasn't migrated yet. This keeps older
 * VPS / Jenkinsfile / Ansible setups working until they are upgraded.
 * In test, allow fallback to `.env.development` when `.env.test` is absent.
 */
export function nestEnvFilePaths(cwd: string = process.cwd()): string[] {
  const nodeEnv = nodeEnvForEnvFile();
  const suffix = envFileSuffixForNodeEnv(nodeEnv);
  const primary = path.join(cwd, `.env.${suffix}`);

  if (nodeEnv === 'test') {
    const fallback = path.join(cwd, '.env.development');
    return existsSync(fallback) ? [primary, fallback] : [primary];
  }

  if (suffix !== nodeEnv) {
    const legacy = path.join(cwd, `.env.${nodeEnv}`);
    if (existsSync(legacy) && !existsSync(primary)) {
      return [legacy];
    }
  }

  return [primary];
}
