import {
  ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE,
  ALL_STORE_PROCEDURE_GROUPS,
  CURRENCY_STORE_PROCEDURE,
  FIAT_DEPOSIT_STORE_PROCEDURE,
  MARKET_STORE_PROCEDURE,
  MATCHING_STORE_PROCEDURE,
  NOTIFICATION_STORE_PROCEDURE,
  ORDER_STORE_PROCEDURE,
  PAYMENT_CONFIG_STORE_PROCEDURE,
  USER_STORE_PROCEDURE,
  WALLET_LEDGER_STORE_PROCEDURE,
  WALLET_STORE_PROCEDURE,
} from './stored-procedure-names';

const SP_NAME_PATTERN = /^sp_[a-z0-9_]+$/;

function valuesOfRecord(obj: Record<string, unknown>): string[] {
  return Object.values(obj).filter((v): v is string => typeof v === 'string');
}

describe('stored procedure name groups', () => {
  it('registers every domain object for invariant checks', () => {
    expect(ALL_STORE_PROCEDURE_GROUPS).toEqual([
      ORDER_STORE_PROCEDURE,
      MATCHING_STORE_PROCEDURE,
      USER_STORE_PROCEDURE,
      WALLET_STORE_PROCEDURE,
      WALLET_LEDGER_STORE_PROCEDURE,
      ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE,
      CURRENCY_STORE_PROCEDURE,
      MARKET_STORE_PROCEDURE,
      NOTIFICATION_STORE_PROCEDURE,
      PAYMENT_CONFIG_STORE_PROCEDURE,
      FIAT_DEPOSIT_STORE_PROCEDURE,
    ]);
  });

  it('each group has non-empty sp_* names and no duplicate values within the same group', () => {
    for (const group of ALL_STORE_PROCEDURE_GROUPS) {
      const vals = valuesOfRecord(group as Record<string, unknown>);
      expect(vals.length).toBeGreaterThan(0);
      for (const v of vals) {
        expect(v).toMatch(SP_NAME_PATTERN);
      }
      expect(new Set(vals).size).toBe(vals.length);
    }
  });

  it('smoke: critical trading and auth procedure strings', () => {
    expect(ORDER_STORE_PROCEDURE.CREATE).toBe('sp_order_create');
    expect(MATCHING_STORE_PROCEDURE.TRADE_EXECUTE).toBe('sp_trade_execute');
    expect(MATCHING_STORE_PROCEDURE.ORDER_CANCEL).toBe(ORDER_STORE_PROCEDURE.CANCEL);
    expect(USER_STORE_PROCEDURE.FIND_BY_ID).toBe('sp_user_find_by_id');
  });
});
