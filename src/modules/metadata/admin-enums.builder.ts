import {
  OrderStatus,
  UserRole,
  UserStatus,
  OnchainTxStatus,
} from '@/common/enums';

/** Fiat (PayOS) deposit rows — matches GET /deposits/admin/all filter. */
export const FIAT_DEPOSIT_ADMIN_STATUSES = ['PENDING', 'PAID', 'CANCELLED'] as const;

/** On-chain withdrawal admin list filter — matches GET /blockchain/admin/withdrawals. */
export const ADMIN_WITHDRAWAL_FILTER_STATUSES: OnchainTxStatus[] = [
  OnchainTxStatus.PENDING,
  OnchainTxStatus.CONFIRMING,
  OnchainTxStatus.COMPLETED,
  OnchainTxStatus.FAILED,
];

export const TREASURY_WALLET_PURPOSES = ['DEPOSIT', 'WITHDRAWAL', 'BOTH'] as const;

/**
 * Reference enum values for admin filters and forms (single source for FE).
 * Labels stay client-side (l10n).
 */
export function buildAdminEnumsPayload(): {
  orderStatus: string[];
  depositStatus: string[];
  withdrawalStatus: string[];
  userRole: string[];
  userStatus: string[];
  treasuryWalletPurpose: string[];
} {
  return {
    orderStatus: Object.values(OrderStatus),
    depositStatus: [...FIAT_DEPOSIT_ADMIN_STATUSES],
    withdrawalStatus: ADMIN_WITHDRAWAL_FILTER_STATUSES.map(String),
    userRole: Object.values(UserRole),
    userStatus: Object.values(UserStatus),
    treasuryWalletPurpose: [...TREASURY_WALLET_PURPOSES],
  };
}
