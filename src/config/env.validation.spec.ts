import 'reflect-metadata';
import { assertOnchainSandboxRpcOrThrow, validateEnvironment } from './env.validation';
import { Environment } from '@/common/enums';

function minimalValidConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NODE_ENV: Environment.Production,
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_USERNAME: 'user',
    DB_PASSWORD: 'pass',
    DB_NAME: 'crypto',
    JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long',
    ...overrides,
  };
}

describe('validateEnvironment', () => {
  it('does not require PayOS env vars in production (DB/UI may supply PayOS)', () => {
    expect(() => validateEnvironment(minimalValidConfig())).not.toThrow();
  });

  it('still validates required DB and JWT when production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: Environment.Production,
        JWT_SECRET: 'x',
      } as Record<string, unknown>),
    ).toThrow(/Environment validation failed/);
  });

  it('does not require sandbox RPC URLs when ONCHAIN_OPERATOR_MODE is production (default)', () => {
    expect(() => validateEnvironment(minimalValidConfig())).not.toThrow();
  });

  it('applies public sandbox RPC defaults when ONCHAIN_OPERATOR_MODE=sandbox and URLs omitted', () => {
    const v = validateEnvironment(
      minimalValidConfig({
        ONCHAIN_OPERATOR_MODE: 'sandbox',
      }),
    );
    expect(v.TRON_NILE_FULL_HOST).toBe('https://nile.trongrid.io');
    expect(v.SOLANA_DEVNET_URL).toBe('https://api.devnet.solana.com');
    expect(v.ETH_SEPOLIA_RPC_URL).toBe('https://rpc.sepolia.org');
    expect(v.BSC_CHAPEL_RPC_URL).toBe('https://data-seed-prebsc-1-s1.binance.org:8545');
  });

  it('passes when sandbox mode and all sandbox RPC URLs are set', () => {
    expect(() =>
      validateEnvironment(
        minimalValidConfig({
          ONCHAIN_OPERATOR_MODE: 'sandbox',
          TRON_NILE_FULL_HOST: 'https://nile.trongrid.io',
          SOLANA_DEVNET_URL: 'https://api.devnet.solana.com',
          ETH_SEPOLIA_RPC_URL: 'https://rpc.sepolia.org',
          BSC_CHAPEL_RPC_URL: 'https://data-seed-prebsc-1-s1.binance.org:8545',
        }),
      ),
    ).not.toThrow();
  });
});

describe('assertOnchainSandboxRpcOrThrow', () => {
  it('no-ops for production mode', () => {
    expect(() =>
      assertOnchainSandboxRpcOrThrow({
        ONCHAIN_OPERATOR_MODE: 'production',
      } as any),
    ).not.toThrow();
  });
});
