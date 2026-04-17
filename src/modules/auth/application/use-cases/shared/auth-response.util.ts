import { getPermissionsForRole } from '@/common/authz/rbac-policy';
import { normalizeUserRole } from '@/common/authz/user-role.util';
import type { Permission } from '@/common/enums';
import type { UserRecord } from '@/modules/users';

export function buildAuthAccessTokenPayload(user: UserRecord) {
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

export function sanitizeAuthUser(user: UserRecord): Partial<UserRecord> {
  const { password_hash, two_fa_secret, ...sanitized } = user;
  return sanitized;
}



