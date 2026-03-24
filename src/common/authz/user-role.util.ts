import { UserRole } from '@/common/enums';

/** Chuẩn hoá role từ JWT/DB; legacy GUEST / VERIFIED_USER → TRADER. */
export function normalizeUserRole(role?: string | UserRole | null): UserRole {
  const r = role == null ? '' : String(role).trim();
  if (r === 'GUEST' || r === 'VERIFIED_USER') {
    return UserRole.TRADER;
  }
  const values = Object.values(UserRole) as string[];
  if (values.includes(r)) {
    return r as UserRole;
  }
  return UserRole.TRADER;
}
