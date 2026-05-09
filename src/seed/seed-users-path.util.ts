import { resolve } from 'node:path';

export interface ResolveSeedUsersJsonPathOptions {
  cwd: string;
  envSeedUsersJson?: string;
  /**
   * Injected for testability — fs.existsSync in prod.
   */
  existsSync?: (path: string) => boolean;
}

/**
 * Resolve the seed users JSON file path.
 *
 * Priority:
 * 1. `SEED_USERS_JSON` env var → must exist (throws if missing)
 * 2. `src/seed/data/users.json` (local dev)
 * 3. `src/seed/data/users.json.example` (fallback)
 * 4. throws if none found
 */
export function resolveSeedUsersJsonPath(options: ResolveSeedUsersJsonPathOptions): string {
  const {
    cwd,
    envSeedUsersJson = process.env.SEED_USERS_JSON,
    existsSync = (f: string) => require('fs').existsSync(f),
  } = options;

  if (envSeedUsersJson) {
    const resolved = resolve(cwd, envSeedUsersJson);
    if (!existsSync(resolved)) {
      throw new Error(
        `SEED_USERS_JSON points to "${resolved}" which does not exist. ` +
          `Check the file path or unset SEED_USERS_JSON.`,
      );
    }
    return resolved;
  }

  const local = resolve(cwd, 'src', 'seed', 'data', 'users.json');
  if (existsSync(local)) {
    return local;
  }

  const example = resolve(cwd, 'src', 'seed', 'data', 'users.json.example');
  if (existsSync(example)) {
    return example;
  }

  throw new Error(
    `No seed users file found. Place "users.json" in src/seed/data/ ` +
      `or set SEED_USERS_JSON to an absolute path.`,
  );
}
