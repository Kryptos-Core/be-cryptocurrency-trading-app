import { resolve } from 'node:path';

export function resolveSeedUsersJsonPath(options: { cwd: string }): string {
  return resolve(options.cwd, 'src', 'seed', 'data', 'users.json');
}
