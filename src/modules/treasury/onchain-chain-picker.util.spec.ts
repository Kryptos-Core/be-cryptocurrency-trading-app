import { listActionableOnchainChainCodes } from '@/common/constants/chain-registry';
import {
  buildChainPickerOptions,
  listTreasuryOpsChainCodes,
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

describe('listTreasuryOpsChainCodes', () => {
  it('sandbox appends the other Tron testnet after the default so both Nile and Shasta appear', () => {
    const withNileDefault = listTreasuryOpsChainCodes(false, 'TRON_NILE');
    expect(withNileDefault.filter((c) => c === 'TRON_NILE' || c === 'TRON_SHASTA')).toEqual([
      'TRON_NILE',
      'TRON_SHASTA',
    ]);
    const withShastaDefault = listTreasuryOpsChainCodes(false, 'TRON_SHASTA');
    expect(withShastaDefault.filter((c) => c === 'TRON_NILE' || c === 'TRON_SHASTA')).toEqual([
      'TRON_SHASTA',
      'TRON_NILE',
    ]);
  });

  it('production matches actionable list (single Tron mainnet)', () => {
    const treas = listTreasuryOpsChainCodes(true, undefined);
    const actionable = listActionableOnchainChainCodes(true);
    expect(treas).toEqual(actionable);
  });
});

describe('buildChainPickerOptions', () => {
  it('sandbox lists expanded testnets including ETH_SEPOLIA and excludes TON from actionable pickers', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'sandbox',
      env: 'development',
    });
    expect(dto.operatorMode).toBe('sandbox');
    const withdrawCodes = dto.pickers.onchain_deposit_withdraw.map((c) => c.code);
    expect(withdrawCodes).toContain('ETH_SEPOLIA');
    expect(withdrawCodes).not.toContain('TON_TESTNET');
    expect(dto.networkCatalog.map((c) => c.code)).toContain('TON_TESTNET');
    expect(withdrawCodes.filter((c) => c.startsWith('TRON_')).length).toBe(2);
    const opsCodes = dto.pickers.treasury_ops.map((c) => c.code);
    expect(opsCodes).toContain('TRON_NILE');
    expect(opsCodes).toContain('TRON_SHASTA');
    expect(opsCodes.length).toBe(withdrawCodes.length);
  });

  it('sandbox TRON_DEFAULT_NETWORK=TRON_NILE lists Nile then Shasta in user-facing pickers', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'sandbox',
      tronDefaultNetwork: 'TRON_NILE',
    });
    const withdrawCodes = dto.pickers.onchain_deposit_withdraw.map((c) => c.code);
    expect(withdrawCodes.filter((c) => c.startsWith('TRON_'))).toEqual([
      'TRON_NILE',
      'TRON_SHASTA',
    ]);
    const opsCodes = dto.pickers.treasury_ops.map((c) => c.code);
    expect(opsCodes.filter((c) => c.startsWith('TRON_'))).toEqual([
      'TRON_NILE',
      'TRON_SHASTA',
    ]);
  });

  it('TRON_DEFAULT_NETWORK=TRON_SHASTA orders Shasta before Nile in actionable pickers', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'sandbox',
      tronDefaultNetwork: 'TRON_SHASTA',
    });
    expect(resolveSandboxTronDefaultNetwork('TRON_SHASTA')).toBe('TRON_SHASTA');
    expect(dto.tronDefaultNetwork).toBe('TRON_SHASTA');
    const withdrawCodes = dto.pickers.onchain_deposit_withdraw.map((c) => c.code);
    expect(withdrawCodes[withdrawCodes.length - 1]).toBe('TRON_NILE');
    const opsCodes = dto.pickers.treasury_ops.map((c) => c.code);
    expect(opsCodes.filter((c) => c.startsWith('TRON_'))).toEqual([
      'TRON_SHASTA',
      'TRON_NILE',
    ]);
  });

  it('production onchain mode lists all mainnet actionable chains', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'production',
      env: 'development',
    });
    expect(dto.operatorMode).toBe('production');
    const withdrawCodes = dto.pickers.onchain_deposit_withdraw.map((c) => c.code);
    expect(withdrawCodes).toContain('ETH_MAINNET');
    expect(withdrawCodes).toContain('BASE_MAINNET');
    expect(withdrawCodes).not.toContain('TON_MAINNET');
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

  it('each picker item includes blockchainLabel', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'production' });
    for (const [, items] of Object.entries(dto.pickers)) {
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.code).toBeTruthy();
        expect(item.blockchainLabel).toBeTruthy();
      }
    }
  });

  it('production blockchainLabels omit network suffix', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'production' });
    const labels = dto.pickers.treasury_ops.map((i) => i.blockchainLabel);
    expect(labels).toContain('Tron');
    expect(labels).toContain('Ethereum');
    expect(labels).toContain('Solana');
    expect(labels).toContain('BNB Smart Chain');
    labels.forEach((lbl) => {
      expect(lbl).not.toMatch(/\(/);
    });
  });

  it('sandbox blockchainLabels include network suffix for non-mainnets', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'sandbox' });
    const withdrawLabels = dto.pickers.onchain_deposit_withdraw;
    const nile = withdrawLabels.find((i) => i.code === 'TRON_NILE');
    const sep = withdrawLabels.find((i) => i.code === 'ETH_SEPOLIA');
    const bsc = withdrawLabels.find((i) => i.code === 'BSC_CHAPEL');
    expect(nile?.blockchainLabel).toBe('Tron (Nile)');
    expect(sep?.blockchainLabel).toBe('Ethereum (Sepolia)');
    expect(bsc?.blockchainLabel).toBe('BNB Smart Chain (Chapel)');
  });

  it('production sets showNetworkSelector to false', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'production' });
    expect(dto.showNetworkSelector).toBe(false);
  });

  it('sandbox sets showNetworkSelector to true', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'sandbox' });
    expect(dto.showNetworkSelector).toBe(true);
  });
});
