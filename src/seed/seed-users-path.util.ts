import * as fs from 'fs';
import * as path from 'path';

export type ResolveSeedUsersPathOptions = {
  cwd: string;
  /** When omitted, uses `process.env.SEED_USERS_JSON`. */
  envSeedUsersJson?: string;
  existsSync?: (p: string) => boolean;
};

/**
 * Resolve path to seed users JSON: SEED_USERS_JSON, then src/seed/data/users.json, then users.json.example.
 */
export function resolveSeedUsersJsonPath(options: ResolveSeedUsersPathOptions): string {
  const { cwd, existsSync = fs.existsSync } = options;
  const fromEnv = (options.envSeedUsersJson ?? process.env.SEED_USERS_JSON)?.trim();
  if (fromEnv) {
    const resolved = path.isAbsolute(fromEnv) ? fromEnv : path.resolve(cwd, fromEnv);
    if (!existsSync(resolved)) {
      throw new Error(`SEED_USERS_JSON path not found: ${resolved}`);
    }
    return resolved;
  }

  const local = path.join(cwd, 'src', 'seed', 'data', 'users.json');
  if (existsSync(local)) {
    return local;
  }

  const example = path.join(cwd, 'src', 'seed', 'data', 'users.json.example');
  if (existsSync(example)) {
    return example;
  }

  throw new Error(
    'No seed users file. Copy src/seed/data/users.json.example to src/seed/data/users.json or set SEED_USERS_JSON.',
  );
}
