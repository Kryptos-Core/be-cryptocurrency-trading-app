import { Injectable } from '@nestjs/common';
import { BlockchainNetwork } from '@/common/enums';
import { EVM_USDT_CONTRACT } from '@/common/constants/evm-usdt-contracts';
import { BlockchainProviderFactory } from '../blockchain-provider.factory';
import { SystemConfigService } from '@/modules/system-config/system-config.service';

const TRON_CHAINS: BlockchainNetwork[] = [
  BlockchainNetwork.TRON_MAINNET,
  BlockchainNetwork.TRON_NILE,
  BlockchainNetwork.TRON_SHASTA,
];

function parseBool(raw: string | null | undefined, defaultTrue: boolean): boolean {
  const v = raw?.trim().toLowerCase();
  if (v === undefined || v === '') return defaultTrue;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  return defaultTrue;
}

function parseIntConfig(raw: string | null | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Runtime flags for deposit watcher (system_config + env fallbacks). */
@Injectable()
export class DepositWatcherConfigService {
  constructor(
    private readonly systemConfig: SystemConfigService,
    private readonly providerFactory: BlockchainProviderFactory,
  ) {}

  async isGloballyEnabled(): Promise<boolean> {
    const fromDb = await this.systemConfig.get<string>('DEPOSIT_WATCHER_ENABLED');
    if (fromDb !== null && fromDb !== undefined) {
      return parseBool(fromDb, true);
    }
    return parseBool(process.env.DEPOSIT_WATCHER_ENABLED, true);
  }

  /**
   * Optional comma-separated allowlist (e.g. `TRON_MAINNET,ETH_MAINNET`).
   * When empty, all watcher-supported chains that the app has providers for are used.
   */
  async enabledChainAllowlist(): Promise<Set<BlockchainNetwork> | null> {
    const raw =
      (await this.systemConfig.get<string>('DEPOSIT_WATCHER_CHAINS'))?.trim() ||
      process.env.DEPOSIT_WATCHER_CHAINS?.trim();
    if (!raw) return null;
    const set = new Set<BlockchainNetwork>();
    for (const part of raw.split(',')) {
      const p = part.trim() as BlockchainNetwork;
      if ((Object.values(BlockchainNetwork) as string[]).includes(p)) {
        set.add(p as BlockchainNetwork);
      }
    }
    return set.size ? set : null;
  }

  private filterByAllowlist(chains: BlockchainNetwork[]): Promise<BlockchainNetwork[]> {
    return this.enabledChainAllowlist().then((allow) => {
      if (!allow) return chains;
      return chains.filter((c) => allow.has(c));
    });
  }

  async enabledTronChains(): Promise<BlockchainNetwork[]> {
    const supported = new Set(this.providerFactory.getSupportedNetworks());
    const list = TRON_CHAINS.filter((c) => supported.has(c));
    return this.filterByAllowlist(list);
  }

  async enabledEvmChains(): Promise<BlockchainNetwork[]> {
    const supported = new Set(this.providerFactory.getSupportedNetworks());
    const withUsdt = (Object.keys(EVM_USDT_CONTRACT) as BlockchainNetwork[]).filter(
      (c) => EVM_USDT_CONTRACT[c] && supported.has(c),
    );
    return this.filterByAllowlist(withUsdt);
  }

  async getEvmMinConfirmations(): Promise<number> {
    const fromDb = await this.systemConfig.get<string>('DEPOSIT_WATCHER_EVM_MIN_CONFIRMATIONS');
    return parseIntConfig(fromDb ?? process.env.DEPOSIT_WATCHER_EVM_MIN_CONFIRMATIONS, 12);
  }

  async getEvmBlockChunk(): Promise<number> {
    const fromDb = await this.systemConfig.get<string>('DEPOSIT_WATCHER_EVM_BLOCK_CHUNK');
    const v = parseIntConfig(fromDb ?? process.env.DEPOSIT_WATCHER_EVM_BLOCK_CHUNK, 2000);
    return Math.min(Math.max(v, 100), 5000);
  }

  async getEvmInitialLookbackBlocks(): Promise<number> {
    const fromDb = await this.systemConfig.get<string>('DEPOSIT_WATCHER_EVM_INITIAL_LOOKBACK');
    return parseIntConfig(fromDb ?? process.env.DEPOSIT_WATCHER_EVM_INITIAL_LOOKBACK, 4000);
  }

  /** Minimum time between enqueue bursts (poller remains the safety net for webhooks). */
  async getPollIntervalMs(): Promise<number> {
    const fromDb = await this.systemConfig.get<string>('DEPOSIT_WATCHER_POLL_INTERVAL_MS');
    const v = parseIntConfig(fromDb ?? process.env.DEPOSIT_WATCHER_POLL_INTERVAL_MS, 45_000);
    return Math.min(Math.max(v, 5000), 3600_000);
  }

  validateWebhookSecret(header: string | undefined): boolean {
    const expected = process.env.DEPOSIT_WATCHER_WEBHOOK_SECRET?.trim();
    if (!expected) return false;
    return (header ?? '').trim() === expected;
  }
}
