import { listActionableOnchainChainCodes } from '@/common/constants/chain-registry';
import {
  buildChainPickerOptions,
  resolveRecommendedChainForDepositPicker,
  resolveSandboxTronDefaultNetwork,
  resolveTreasuryChainsUseMainnetOnly,
} from './onchain-chain-picker.util';

describe('resolveRecommendedChainForDepositPicker', () => {
  const sandboxChains = listActionableOnchainChainCodes(false, 'TRON_NILE');

  it('keeps setting when it is in the on-chain deposit/withdraw picker list', () => {
    expect(resolveRecommendedChainForDepositPicker('TRON_NILE', sandboxChains, 'TRON_NILE')).toBe(
      'TRON_NILE',
    );
  });

  it('maps TRON_MAINNET to sandbox Tron row when mainnet is not in picker', () => {
    expect(
      resolveRecommendedChainForDepositPicker('TRON_MAINNET', sandboxChains, 'TRON_NILE'),
    ).toBe('TRON_NILE');
  });

  it('maps TRON_MAINNET to TRON_SHASTA when that is the configured sandbox default', () => {
    const shastaCodes = listActionableOnchainChainCodes(false, 'TRON_SHASTA');
    expect(
      resolveRecommendedChainForDepositPicker('TRON_MAINNET', shastaCodes, 'TRON_SHASTA'),
    ).toBe('TRON_SHASTA');
  });

  it('falls back to first picker chain when neither setting nor tron default match', () => {
    expect(
      resolveRecommendedChainForDepositPicker('TRON_MAINNET', ['BSC_CHAPEL'], 'TRON_NILE'),
    ).toBe('BSC_CHAPEL');
  });
});

describe('resolveTreasuryChainsUseMainnetOnly', () => {
  it('explicit sandbox forces testnet even when ENV=production', () => {
    expect(
      resolveTreasuryChainsUseMainnetOnly({
        onchainOperatorMode: 'sandbox',
        env: 'production',
      }),
    ).toBe(false);
  });

  it('explicit production forces mainnet even when ENV=development', () => {
    expect(
      resolveTreasuryChainsUseMainnetOnly({
        onchainOperatorMode: 'production',
        env: 'development',
      }),
    ).toBe(true);
  });

  it('blank ONCHAIN falls back to ENV=development → testnets', () => {
    expect(
      resolveTreasuryChainsUseMainnetOnly({ onchainOperatorMode: '', env: 'development' }),
    ).toBe(false);
  });

  it('missing ONCHAIN key falls back to ENV=production → mainnet', () => {
    expect(resolveTreasuryChainsUseMainnetOnly({ env: 'production' })).toBe(true);
  });
});

describe('buildChainPickerOptions', () => {
  it('sandbox lists expanded testnets including ETH_SEPOLIA and excludes TON from actionable pickers', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'sandbox',
      env: 'development',
    });
    expect(dto.operatorMode).toBe('sandbox');
    expect(dto.pickers.onchain_deposit_withdraw).toContain('ETH_SEPOLIA');
    expect(dto.pickers.onchain_deposit_withdraw).not.toContain('TON_TESTNET');
    expect(dto.networkCatalog.map((c) => c.code)).toContain('TON_TESTNET');
    expect(dto.pickers.treasury_ops).toEqual(dto.pickers.onchain_deposit_withdraw);
  });

  it('TRON_DEFAULT_NETWORK=TRON_SHASTA ends actionable list with TRON_SHASTA', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'sandbox',
      tronDefaultNetwork: 'TRON_SHASTA',
    });
    expect(resolveSandboxTronDefaultNetwork('TRON_SHASTA')).toBe('TRON_SHASTA');
    expect(dto.tronDefaultNetwork).toBe('TRON_SHASTA');
    expect(
      dto.pickers.onchain_deposit_withdraw[dto.pickers.onchain_deposit_withdraw.length - 1],
    ).toBe('TRON_SHASTA');
  });

  it('production onchain mode lists all mainnet actionable chains', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'production',
      env: 'development',
    });
    expect(dto.operatorMode).toBe('production');
    expect(dto.pickers.onchain_deposit_withdraw).toContain('ETH_MAINNET');
    expect(dto.pickers.onchain_deposit_withdraw).toContain('BASE_MAINNET');
    expect(dto.pickers.onchain_deposit_withdraw).not.toContain('TON_MAINNET');
    expect(dto.tronDefaultNetwork).toBe('TRON_MAINNET');
  });

  it('treasury_main_wallet and treasury_history_filter match treasury_ops', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'sandbox' });
    expect(dto.pickers.treasury_main_wallet).toEqual(dto.pickers.treasury_ops);
    expect(dto.pickers.treasury_history_filter).toEqual(dto.pickers.treasury_ops);
  });

  it('withdrawal_admin_filter matches actionable on-chain list', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'sandbox' });
    expect(dto.pickers.withdrawal_admin_filter).toEqual(dto.pickers.onchain_deposit_withdraw);
  });

  it('managed_wallets matches onchain_deposit_withdraw (sandbox and production)', () => {
    const sandbox = buildChainPickerOptions({ onchainOperatorMode: 'sandbox' });
    expect(sandbox.pickers.managed_wallets).toEqual(sandbox.pickers.onchain_deposit_withdraw);
    const prod = buildChainPickerOptions({ onchainOperatorMode: 'production' });
    expect(prod.pickers.managed_wallets).toEqual(prod.pickers.onchain_deposit_withdraw);
  });

  it('networkCatalog first row is TON with deposit disabled in production', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'production' });
    expect(dto.networkCatalog[0].code).toBe('TON_MAINNET');
    expect(dto.networkCatalog[0].capabilities.deposit).toBe(false);
  });
});
