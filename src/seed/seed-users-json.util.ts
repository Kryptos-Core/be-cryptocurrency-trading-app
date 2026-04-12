import { UserRole } from '@/common/enums';

export type SeedUserRow = {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  status: 'ACTIVE' | 'BANNED' | 'PENDING';
  role: UserRole;
};

/**
 * Parse seed JSON and require a non-empty `role` on every row (no email-based defaults).
 */
export function parseAndValidateSeedUsers(raw: string): SeedUserRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Seed users file is not valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Seed users must be a JSON array');
  }

  const out: SeedUserRow[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const u = parsed[i];
    if (!u || typeof u !== 'object') {
      throw new Error(`Seed users[${i}] must be an object`);
    }
    const row = u as Record<string, unknown>;
    const email = row.email;
    const password = row.password;
    const status = row.status;
    const role = row.role;
    if (typeof email !== 'string' || !email.trim()) {
      throw new Error(`Seed users[${i}] missing string "email"`);
    }
    if (typeof password !== 'string' || !password) {
      throw new Error(`Seed users[${i}] missing "password" for ${email}`);
    }
    if (
      status !== undefined &&
      status !== 'ACTIVE' &&
      status !== 'BANNED' &&
      status !== 'PENDING'
    ) {
      throw new Error(`Seed users[${i}] invalid "status" for ${email}`);
    }
    if (typeof role !== 'string' || !role.trim()) {
      throw new Error(`Seed users[${i}] missing required "role" for ${email}`);
    }
    if (!Object.values(UserRole).includes(role as UserRole)) {
      throw new Error(`Seed users[${i}] unknown "role" ${role} for ${email}`);
    }
    out.push({
      email: email.trim().toLowerCase(),
      password,
      first_name: typeof row.first_name === 'string' ? row.first_name : undefined,
      last_name: typeof row.last_name === 'string' ? row.last_name : undefined,
      status: (status as SeedUserRow['status']) ?? 'ACTIVE',
      role: role as UserRole,
    });
  }
  return out;
}
