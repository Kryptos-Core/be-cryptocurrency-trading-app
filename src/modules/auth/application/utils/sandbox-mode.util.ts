import type { ConfigService } from '@nestjs/config';

/**
 * Returns true when the deployment is in on-chain sandbox mode.
 * Mirrors the same rule used in `env.validation.ts` and
 * `OnchainChainPickerService` (NODE_ENV/ENV fall-back intentionally omitted —
 * sandbox is an explicit opt-in for testing).
 */
export function isSandboxMode(config: ConfigService): boolean {
  const raw = config.get<string>('ONCHAIN_OPERATOR_MODE');
  return String(raw ?? 'production').toLowerCase().trim() === 'sandbox';
}
