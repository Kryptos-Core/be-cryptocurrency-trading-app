import { Permission, UserRole } from '@/common/enums';

const ROLE_PERMISSION_MATRIX: Record<UserRole, Permission[]> = {
  [UserRole.GUEST]: [],
  [UserRole.TRADER]: [
    Permission.ORDERS_PLACE,
    Permission.ORDERS_CANCEL,
    Permission.WALLETS_WITHDRAW,
  ],
  [UserRole.VERIFIED_USER]: [
    Permission.ORDERS_PLACE,
    Permission.ORDERS_CANCEL,
    Permission.WALLETS_WITHDRAW,
  ],
  [UserRole.MARKET_MAKER]: [
    Permission.ORDERS_PLACE,
    Permission.ORDERS_CANCEL,
    Permission.WALLETS_WITHDRAW,
  ],
  [UserRole.SUPPORT_AGENT]: [
    Permission.USERS_READ,
    Permission.SUPPORT_CASES,
  ],
  [UserRole.RISK_OFFICER]: [
    Permission.USERS_READ,
    Permission.RISK_REVIEW,
    Permission.USERS_SECURITY_REVIEW,
    Permission.WALLETS_READ,
    Permission.WALLETS_MANAGE,
    Permission.WALLETS_WITHDRAW,
  ],
  [UserRole.FINANCE_MANAGER]: [
    Permission.WALLETS_READ,
    Permission.PAYMENT_CONFIGS_MANAGE,
  ],
  [UserRole.ADMIN]: [
    Permission.USERS_READ,
    Permission.USERS_MANAGE,
    Permission.USERS_SECURITY_REVIEW,
    Permission.CURRENCIES_MANAGE,
    Permission.MARKETS_MANAGE,
    Permission.EXCHANGE_SYNC,
    Permission.ORDERS_PLACE,
    Permission.ORDERS_CANCEL,
    Permission.WALLETS_READ,
    Permission.WALLETS_MANAGE,
    Permission.WALLETS_WITHDRAW,
    Permission.RISK_REVIEW,
    Permission.SUPPORT_CASES,
    Permission.NOTIFICATIONS_BROADCAST,
    Permission.PAYMENT_CONFIGS_MANAGE,
  ],
};

export function getPermissionsForRole(role?: UserRole): Permission[] {
  const safeRole = role ?? UserRole.TRADER;
  return ROLE_PERMISSION_MATRIX[safeRole] ?? ROLE_PERMISSION_MATRIX[UserRole.TRADER];
}

export function hasPermission(
  role: UserRole | undefined,
  requiredPermissions: readonly Permission[],
): boolean {
  const granted = new Set(getPermissionsForRole(role));
  return requiredPermissions.every((permission) => granted.has(permission));
}
