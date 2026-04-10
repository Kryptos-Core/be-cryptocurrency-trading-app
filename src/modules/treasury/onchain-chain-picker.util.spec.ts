import {
  buildChainPickerOptions,
  resolveRecommendedChainForDepositPicker,
  resolveSandboxTronDefaultNetwork,
  resolveTreasuryChainsUseMainnetOnly,
} from './onchain-chain-picker.util';

describe('resolveRecommendedChainForDepositPicker', () => {
  const sandboxChains = ['BSC_CHAPEL', 'SOLANA_DEVNET', 'TRON_NILE'];

  it('keeps setting when it is in the on-chain deposit/withdraw picker list', () => {
    expect(
      resolveRecommendedChainForDepositPicker('TRON_NILE', sandboxChains, 'TRON_NILE'),
    ).toBe('TRON_NILE');
  });

  it('maps TRON_MAINNET to sandbox Tron row when mainnet is not in picker', () => {
    expect(
      resolveRecommendedChainForDepositPicker('TRON_MAINNET', sandboxChains, 'TRON_NILE'),
    ).toBe('TRON_NILE');
  });

  it('maps TRON_MAINNET to TRON_SHASTA when that is the configured sandbox default', () => {
    const shasta = ['BSC_CHAPEL', 'SOLANA_DEVNET', 'TRON_SHASTA'];
    expect(
      resolveRecommendedChainForDepositPicker('TRON_MAINNET', shasta, 'TRON_SHASTA'),
    ).toBe('TRON_SHASTA');
  });

  it('falls back to first picker chain when neither setting nor tron default match', () => {
    expect(resolveRecommendedChainForDepositPicker('TRON_MAINNET', ['BSC_CHAPEL'], 'TRON_NILE')).toBe(
      'BSC_CHAPEL',
    );
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
    expect(resolveTreasuryChainsUseMainnetOnly({ onchainOperatorMode: '', env: 'development' })).toBe(
      false,
    );
  });

  it('missing ONCHAIN key falls back to ENV=production → mainnet', () => {
    expect(resolveTreasuryChainsUseMainnetOnly({ env: 'production' })).toBe(true);
  });
});

describe('buildChainPickerOptions', () => {
  it('sandbox lists one Tron testnet + Solana + BSC Chapel (no Sepolia)', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'sandbox',
      env: 'development',
    });
    expect(dto.operatorMode).toBe('sandbox');
    expect(dto.pickers.treasury_ops).toContain('SOLANA_DEVNET');
    expect(dto.pickers.treasury_ops).toContain('BSC_CHAPEL');
    expect(dto.pickers.treasury_ops).not.toContain('ETH_SEPOLIA');
    expect(dto.pickers.treasury_ops.filter((c) => c === 'TRON_NILE' || c === 'TRON_SHASTA').length).toBe(
      1,
    );
    expect(dto.pickers.treasury_ops).not.toContain('TRON_MAINNET');
  });

  it('TRON_DEFAULT_NETWORK=TRON_SHASTA picks Shasta for treasury_ops first row', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'sandbox',
      tronDefaultNetwork: 'TRON_SHASTA',
    });
    expect(resolveSandboxTronDefaultNetwork('TRON_SHASTA')).toBe('TRON_SHASTA');
    expect(dto.tronDefaultNetwork).toBe('TRON_SHASTA');
    expect(dto.pickers.treasury_ops[0]).toBe('TRON_SHASTA');
  });

  it('production onchain mode keeps narrow mainnet treasury_ops list', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'production',
      env: 'development',
    });
    expect(dto.operatorMode).toBe('production');
    expect(dto.pickers.treasury_ops).toEqual(['TRON_MAINNET', 'ETH_MAINNET']);
    expect(dto.tronDefaultNetwork).toBe('TRON_MAINNET');
  });

  it('treasury_main_wallet and treasury_history_filter match treasury_ops', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'sandbox' });
    expect(dto.pickers.treasury_main_wallet).toEqual(dto.pickers.treasury_ops);
    expect(dto.pickers.treasury_history_filter).toEqual(dto.pickers.treasury_ops);
  });

  it('withdrawal_admin_filter sandbox matches legacy FE list', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'sandbox' });
    expect(dto.pickers.withdrawal_admin_filter).toEqual([
      'TRON_NILE',
      'TRON_SHASTA',
      'SOLANA_DEVNET',
      'BSC_CHAPEL',
    ]);
  });

  it('managed_wallets production is TRON_MAINNET only', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'production' });
    expect(dto.pickers.managed_wallets).toEqual(['TRON_MAINNET']);
  });

  it('onchain_deposit_withdraw sandbox is Chapel, Solana devnet, default Tron testnet (no Sepolia)', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'sandbox' });
    expect(dto.pickers.onchain_deposit_withdraw).toEqual([
      'BSC_CHAPEL',
      'SOLANA_DEVNET',
      'TRON_NILE',
    ]);
  });

  it('onchain_deposit_withdraw sandbox ends with Shasta when TRON_DEFAULT_NETWORK=TRON_SHASTA', () => {
    const dto = buildChainPickerOptions({
      onchainOperatorMode: 'sandbox',
      tronDefaultNetwork: 'TRON_SHASTA',
    });
    expect(dto.pickers.onchain_deposit_withdraw).toEqual([
      'BSC_CHAPEL',
      'SOLANA_DEVNET',
      'TRON_SHASTA',
    ]);
  });

  it('onchain_deposit_withdraw production lists four mainnets (EVM / Solana / Tron)', () => {
    const dto = buildChainPickerOptions({ onchainOperatorMode: 'production' });
    expect(dto.pickers.onchain_deposit_withdraw).toEqual([
      'ETH_MAINNET',
      'BSC_MAINNET',
      'SOLANA_MAINNET',
      'TRON_MAINNET',
    ]);
  });
});
