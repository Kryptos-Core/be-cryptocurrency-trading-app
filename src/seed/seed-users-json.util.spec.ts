import { parseAndValidateSeedUsers } from './seed-users-json.util';

describe('parseAndValidateSeedUsers', () => {
  it('accepts valid array with role on each user', () => {
    const raw = JSON.stringify([
      {
        email: 'a@example.com',
        password: 'x',
        status: 'ACTIVE',
        role: 'ADMIN',
      },
    ]);
    const users = parseAndValidateSeedUsers(raw);
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe('ADMIN');
  });

  it('rejects non-array JSON', () => {
    expect(() => parseAndValidateSeedUsers('{}')).toThrow(/array/);
  });

  it('rejects user without role', () => {
    const raw = JSON.stringify([{ email: 'a@example.com', password: 'x', status: 'ACTIVE' }]);
    expect(() => parseAndValidateSeedUsers(raw)).toThrow(/role/);
  });
});
