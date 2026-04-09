import * as path from 'path';
import { resolveSeedUsersJsonPath } from './seed-users-path.util';

describe('resolveSeedUsersJsonPath', () => {
  const cwd = path.join(__dirname, 'fixture-resolve');

  it('uses SEED_USERS_JSON when set and file exists', () => {
    const custom = path.resolve(cwd, 'custom.json');
    const p = resolveSeedUsersJsonPath({
      cwd,
      envSeedUsersJson: 'custom.json',
      existsSync: (f) => f === custom,
    });
    expect(p).toBe(custom);
  });

  it('throws when SEED_USERS_JSON points to missing file', () => {
    expect(() =>
      resolveSeedUsersJsonPath({
        cwd,
        envSeedUsersJson: 'nope.json',
        existsSync: () => false,
      }),
    ).toThrow(/SEED_USERS_JSON/);
  });

  it('prefers src/seed/data/users.json when present', () => {
    const local = path.join(cwd, 'src', 'seed', 'data', 'users.json');
    const p = resolveSeedUsersJsonPath({
      cwd,
      existsSync: (f) => f === local,
    });
    expect(p).toBe(local);
  });

  it('falls back to users.json.example when users.json missing', () => {
    const example = path.join(cwd, 'src', 'seed', 'data', 'users.json.example');
    const p = resolveSeedUsersJsonPath({
      cwd,
      existsSync: (f) => f === example,
    });
    expect(p).toBe(example);
  });

  it('throws when no seed file exists', () => {
    expect(() =>
      resolveSeedUsersJsonPath({
        cwd,
        existsSync: () => false,
      }),
    ).toThrow(/users\.json\.example/);
  });
});
