import { getPermissionsForRole } from '@/common/authz/rbac-policy';
import { normalizeUserRole } from '@/common/authz/user-role.util';
import type { Permission } from '@/common/enums';
import type { User } from '@/entities/user.entity';

export function buildAuthAccessTokenPayload(user: User) {
  const role = normalizeUserRole(user.role as string);
  const permissions = getPermissionsForRole(role) as Permission[];

  return {
    userId: user.user_id,
    email: user.email,
    role,
    identityVerified: user.identity_verified === 1,
    emailVerified: user.email_verified === 1,
    permissions,
    sub: user.user_id,
  };
}

export function sanitizeAuthUser(user: User): Partial<User> {
  const { password_hash, two_fa_secret, ...sanitized } = user;
  return sanitized;
}
