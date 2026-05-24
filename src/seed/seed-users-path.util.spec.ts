import * as path from 'node:path';
import { isEncryptedSeedPath, resolveSeedUsersJsonPath } from './seed-users-path.util';

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

  it('prefers users.json.enc over users.json when both exist', () => {
    const encPath = path.join(cwd, 'src', 'seed', 'data', 'users.json.enc');
    const jsonPath = path.join(cwd, 'src', 'seed', 'data', 'users.json');
    const p = resolveSeedUsersJsonPath({
      cwd,
      existsSync: (f) => f === encPath || f === jsonPath,
    });
    expect(p).toBe(encPath);
  });

  it('prefers users.json when users.json.enc is absent', () => {
    const local = path.join(cwd, 'src', 'seed', 'data', 'users.json');
    const p = resolveSeedUsersJsonPath({
      cwd,
      existsSync: (f) => f === local,
    });
    expect(p).toBe(local);
  });

  it('falls back to users.json.example when users.json and users.json.enc missing', () => {
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
    ).toThrow(/users\.json/);
  });
});

describe('isEncryptedSeedPath', () => {
  it('returns true for .enc files', () => {
    expect(isEncryptedSeedPath('users.json.enc')).toBe(true);
    expect(isEncryptedSeedPath('/absolute/path/users.json.enc')).toBe(true);
  });

  it('returns false for .json files', () => {
    expect(isEncryptedSeedPath('users.json')).toBe(false);
    expect(isEncryptedSeedPath('users.json.example')).toBe(false);
  });
});
