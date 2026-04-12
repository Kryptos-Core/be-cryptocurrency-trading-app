import { OnchainTxStatus, OrderStatus, UserRole } from '@/common/enums';
import { buildAdminEnumsPayload, FIAT_DEPOSIT_ADMIN_STATUSES } from './admin-enums.builder';

describe('buildAdminEnumsPayload', () => {
  it('includes all order statuses', () => {
    const p = buildAdminEnumsPayload();
    expect(p.orderStatus).toEqual(Object.values(OrderStatus));
    expect(p.orderStatus).toContain('OPEN');
  });

  it('includes fiat deposit admin statuses', () => {
    const p = buildAdminEnumsPayload();
    expect(p.depositStatus).toEqual([...FIAT_DEPOSIT_ADMIN_STATUSES]);
  });

  it('includes on-chain withdrawal filter statuses', () => {
    const p = buildAdminEnumsPayload();
    expect(p.withdrawalStatus).toContain(OnchainTxStatus.PENDING);
    expect(p.withdrawalStatus).toContain(OnchainTxStatus.COMPLETED);
    expect(p.withdrawalStatus.length).toBe(4);
  });

  it('includes user roles for admin user list filter', () => {
    const p = buildAdminEnumsPayload();
    expect(p.userRole).toEqual(Object.values(UserRole));
    expect(p.userRole).toContain('FINANCE_MANAGER');
  });

  it('includes treasury wallet purposes', () => {
    const p = buildAdminEnumsPayload();
    expect(p.treasuryWalletPurpose).toEqual(['DEPOSIT', 'WITHDRAWAL', 'BOTH']);
  });
});
