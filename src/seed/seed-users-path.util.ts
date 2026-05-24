import { resolve } from 'node:path';

/**
 * Returns true if the given path is an encrypted seed file (.enc).
 * Callers MUST decrypt the file contents before parsing when this returns true.
 */
export function isEncryptedSeedPath(path: string): boolean {
  return path.endsWith('.enc');
}

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
 * 2. `src/seed/data/users.json.enc` (encrypted seed data — preferred when present)
 * 3. `src/seed/data/users.json` (plaintext seed data)
 * 4. `src/seed/data/users.json.example` (fallback)
 * 5. throws if none found
 *
 * When an `.enc` file is returned, callers MUST decrypt the contents before use.
 * When a `.json` file is returned, callers use it directly.
 */
export function resolveSeedUsersJsonPath(options: ResolveSeedUsersJsonPathOptions): string {
  const {
    cwd,
    envSeedUsersJson = process.env.SEED_USERS_JSON,
    existsSync = (f: string) => require('node:fs').existsSync(f),
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

  // Encrypted seed data takes priority over plaintext.
  const encPath = resolve(cwd, 'src', 'seed', 'data', 'users.json.enc');
  if (existsSync(encPath)) {
    return encPath;
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
    `No seed users file found. Place "users.json" or "users.json.enc" in src/seed/data/ ` +
      `or set SEED_USERS_JSON to an absolute path.`,
  );
}
