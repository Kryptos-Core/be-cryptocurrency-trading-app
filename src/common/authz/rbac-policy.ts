import { Permission, UserRole } from '@/common/enums';

const ROLE_PERMISSION_MATRIX: Record<UserRole, Permission[]> = {
  [UserRole.TRADER]: [
    Permission.ORDERS_PLACE,
    Permission.ORDERS_CANCEL,
    Permission.WALLETS_WITHDRAW,
  ],
  [UserRole.MARKET_MAKER]: [
    Permission.ORDERS_PLACE,
    Permission.ORDERS_CANCEL,
    Permission.ORDERS_BATCH_PLACE,
    Permission.ORDERS_READ,
    Permission.MARKET_MAKER_CONFIG,
    Permission.MARKET_MAKER_DASHBOARD,
    Permission.WALLETS_WITHDRAW,
  ],
  [UserRole.SUPPORT_AGENT]: [
    Permission.USERS_READ,
    Permission.SUPPORT_CASES,
    /** Giám sát lệnh toàn sàn (GET /orders/admin/all) */
    Permission.ORDERS_READ,
  ],
  [UserRole.RISK_OFFICER]: [
    Permission.USERS_READ,
    Permission.RISK_REVIEW,
    Permission.USERS_SECURITY_REVIEW,
    Permission.WALLETS_READ,
    Permission.WALLETS_MANAGE,
    Permission.WALLETS_WITHDRAW,
    Permission.WITHDRAWALS_APPROVE,
    /** Giám sát lệnh / phát hiện bất thường */
    Permission.ORDERS_READ,
    /** Khôi phục khớp lệnh thủ công theo cặp khi cần */
    Permission.MATCHING_RECONCILE,
    /** Vận hành/replay integration outbox khi projection hoặc publisher lỗi */
    Permission.OUTBOX_MANAGE,
  ],
  [UserRole.FINANCE_MANAGER]: [
    Permission.WALLETS_READ,
    /** Ví nạp mặc định, điều chỉnh số dư, quản lý ví giao dịch (cùng cấp vận hành tiền với Risk). */
    Permission.WALLETS_MANAGE,
    Permission.WALLETS_WITHDRAW,
    Permission.PAYMENT_CONFIGS_MANAGE,
    Permission.WITHDRAWALS_APPROVE,
  ],
  [UserRole.ADMIN]: [
    Permission.USERS_READ,
    Permission.USERS_MANAGE,
    Permission.USERS_SECURITY_REVIEW,
    Permission.CURRENCIES_MANAGE,
    Permission.MARKETS_MANAGE,
    Permission.MARKET_READ_MODEL_OBSERVE,
    Permission.EXCHANGE_SYNC,
    Permission.ORDERS_PLACE,
    Permission.ORDERS_CANCEL,
    Permission.ORDERS_BATCH_PLACE,
    Permission.ORDERS_READ,
    Permission.ORDERS_MANAGE,
    Permission.MATCHING_RECONCILE,
    Permission.WALLETS_READ,
    Permission.WALLETS_MANAGE,
    Permission.WALLETS_WITHDRAW,
    Permission.RISK_REVIEW,
    Permission.SUPPORT_CASES,
    Permission.NOTIFICATIONS_BROADCAST,
    Permission.OUTBOX_MANAGE,
    Permission.PAYMENT_CONFIGS_MANAGE,
    Permission.WITHDRAWALS_APPROVE,
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


