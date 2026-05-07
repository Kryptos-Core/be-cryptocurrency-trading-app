import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainNetwork } from '@/common/enums';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import type { TronTreasuryNetwork } from '@/modules/treasury/treasury-tron-usdt-contracts';
import { TRON_USDT_CONTRACT } from '@/modules/treasury/treasury-tron-usdt-contracts';
import { tronContractAddressesEqual } from '../utils/tron-contract-address.util';
import { DepositIngestionService } from './deposit-ingestion.service';
import { DepositWatcherCursorRepository } from './deposit-watcher-cursor.repository';

/** TronGrid endpoints (require API key for higher rate limits) */
const TRON_GRID: Partial<Record<BlockchainNetwork, string>> = {
  [BlockchainNetwork.TRON_MAINNET]: 'https://api.trongrid.io',
  [BlockchainNetwork.TRON_NILE]: 'https://nile.trongrid.io',
  [BlockchainNetwork.TRON_SHASTA]: 'https://api.shasta.trongrid.io',
};

/** Public full-node RPC endpoints (no API key required, but rate-limited) */
const TRON_PUBLIC_RPC: Partial<Record<BlockchainNetwork, string>> = {
  [BlockchainNetwork.TRON_MAINNET]: 'https://api.trongrid.io',
  [BlockchainNetwork.TRON_NILE]: 'https://nile.tronapi.io',
  [BlockchainNetwork.TRON_SHASTA]: 'https://api.shasta.trongrid.io',
};

type TronGridTrc20Row = {
  transaction_id?: string;
  block_timestamp?: number;
  token_info?: { address?: string; symbol?: string };
};

/**
 * Poll TronGrid TRC-20 history for the platform deposit address and enqueue new tx hashes for ingestion.
 * Falls back to public RPC when TronGrid API key is not configured.
 */
@Injectable()
export class TronDepositObserverService {
  private readonly logger = new Logger(TronDepositObserverService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly managedWalletsService: ManagedWalletsService,
    private readonly cursors: DepositWatcherCursorRepository,
    private readonly ingestion: DepositIngestionService,
  ) {}

  private tronGridApiKey(): string | undefined {
    return this.configService.get<string>('TRON_GRID_API_KEY')?.trim() || undefined;
  }

  /**
   * Get the base URL for TRON API calls.
   * Uses TronGrid with API key if available, otherwise falls back to public RPC.
   */
  private getApiBase(chain: BlockchainNetwork): string | undefined {
    const gridBase = TRON_GRID[chain];
    if (!gridBase) return undefined;

    const apiKey = this.tronGridApiKey();
    if (apiKey) {
      this.logger.debug(`Using TronGrid with API key for ${chain}`);
      return gridBase;
    }

    const publicRpc = TRON_PUBLIC_RPC[chain];
    if (publicRpc) {
      this.logger.debug(
        `No TronGrid API key, falling back to public RPC for ${chain}: ${publicRpc}`,
      );
      return publicRpc;
    }

    this.logger.warn(`No API endpoint available for chain ${chain}`);
    return undefined;
  }

  /**
   * Get HTTP headers for API calls (includes API key if available).
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const key = this.tronGridApiKey();
    if (key) headers['TRON-PRO-API-KEY'] = key;
    return headers;
  }

  async scanChain(chain: BlockchainNetwork): Promise<void> {
    if (
      chain !== BlockchainNetwork.TRON_MAINNET &&
      chain !== BlockchainNetwork.TRON_NILE &&
      chain !== BlockchainNetwork.TRON_SHASTA
    ) {
      return;
    }

    const deposit = (
      await this.managedWalletsService.getPublicDepositRecipientAddress(chain)
    )?.trim();
    if (!deposit) {
      this.logger.debug(`tron.deposit.watch.skip_no_address chain=${chain}`);
      return;
    }

    const row = await this.cursors.findByChain(chain);
    let minTs = row?.cursor_kind === 'TIMESTAMP_MS' ? Number(BigInt(row.cursor_value)) : 0;
    if (minTs <= 0) {
      minTs = Math.max(0, Date.now() - 86400000 * 7);
    }

    const base = this.getApiBase(chain);
    if (!base) return;
    const headers = this.getHeaders();

    // Try TronGrid API first (TRC-20 transfers)
    const trc20Success = await this.scanTrc20Transfers(chain, deposit, minTs, base, headers);

    // Also scan native TRX transfers
    await this.scanNativeTransfers(chain, deposit, minTs, base, headers);

    // If TronGrid failed completely, try alternative RPC-based approach
    if (!trc20Success) {
      await this.scanViaAlternativeRpc(chain, deposit, minTs);
    }

    // Always update cursor (even if some requests failed)
    const maxTs = await this.calculateMaxTimestamp(chain, deposit, minTs);
    const nextCursor = BigInt(maxTs + 1);
    await this.cursors.upsertCursor(chain, nextCursor, 'TIMESTAMP_MS');
  }

  /**
   * Scan TRC-20 token transfers via TronGrid API.
   * Returns true if successful, false if failed.
   */
  private async scanTrc20Transfers(
    chain: BlockchainNetwork,
    deposit: string,
    minTs: number,
    base: string,
    headers: Record<string, string>,
  ): Promise<boolean> {
    const url = new URL(`/v1/accounts/${encodeURIComponent(deposit)}/transactions/trc20`, base);
    url.searchParams.set('only_confirmed', 'true');
    url.searchParams.set('limit', '40');
    url.searchParams.set('order_by', 'block_timestamp,asc');
    url.searchParams.set('min_timestamp', String(minTs));

    try {
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        this.logger.warn(`tron.deposit.watch.trc20_http_error chain=${chain} status=${res.status}`);
        return false;
      }

      const body = (await res.json()) as { data?: TronGridTrc20Row[] };
      const data = Array.isArray(body.data) ? body.data : [];

      if (data.length === 0) {
        this.logger.debug(`tron.deposit.watch.trc20_no_txs chain=${chain} minTs=${minTs}`);
        return true; // Empty is not an error
      }

      const tronNet: TronTreasuryNetwork =
        chain === BlockchainNetwork.TRON_MAINNET
          ? 'TRON_MAINNET'
          : chain === BlockchainNetwork.TRON_SHASTA
            ? 'TRON_SHASTA'
            : 'TRON_NILE';
      const usdtContract = TRON_USDT_CONTRACT[tronNet];

      let maxTs = minTs;
      for (const item of data) {
        const txId = item.transaction_id?.trim();
        const ts = item.block_timestamp ?? 0;
        if (!txId || ts <= 0) continue;
        if (ts > maxTs) maxTs = ts;

        const tokenAddr = item.token_info?.address?.trim();
        if (usdtContract && tokenAddr && !tronContractAddressesEqual(tokenAddr, usdtContract)) {
          continue;
        }

        try {
          await this.ingestion.ingestTxHash(chain, txId);
        } catch (e) {
          this.logger.warn(`tron.deposit.watch.ingest_failed tx=${txId} ${(e as Error).message}`);
        }
      }
      return true;
    } catch (e) {
      this.logger.warn(`tron.deposit.watch.trc20_error chain=${chain}: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * Scan native TRX transfers via TronGrid API.
   */
  private async scanNativeTransfers(
    chain: BlockchainNetwork,
    deposit: string,
    minTs: number,
    base: string,
    headers: Record<string, string>,
  ): Promise<void> {
    const nativeUrl = new URL(`/v1/accounts/${encodeURIComponent(deposit)}/transactions`, base);
    nativeUrl.searchParams.set('only_confirmed', 'true');
    nativeUrl.searchParams.set('limit', '25');
    nativeUrl.searchParams.set('order_by', 'block_timestamp,asc');
    nativeUrl.searchParams.set('min_timestamp', String(minTs));

    try {
      const resNative = await fetch(nativeUrl.toString(), { headers });
      if (!resNative.ok) {
        this.logger.warn(
          `tron.deposit.watch.native_http_error chain=${chain} status=${resNative.status}`,
        );
        return;
      }

      const nativeBody = (await resNative.json()) as {
        data?: { txID?: string; block_timestamp?: number }[];
      };
      const nativeRows = Array.isArray(nativeBody.data) ? nativeBody.data : [];

      const seenTx = new Set<string>();
      for (const tx of nativeRows) {
        const txId = (tx.txID ?? (tx as { transaction_id?: string }).transaction_id)?.trim();
        const ts = tx.block_timestamp ?? 0;
        if (!txId || ts <= 0) continue;
        if (seenTx.has(txId)) continue;
        seenTx.add(txId);

        try {
          await this.ingestion.ingestTxHash(chain, txId);
        } catch (e) {
          this.logger.warn(
            `tron.deposit.watch.ingest_failed_native tx=${txId} ${(e as Error).message}`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(`tron.deposit.watch.native_error chain=${chain}: ${(e as Error).message}`);
    }
  }

  /**
   * Alternative RPC-based scanning using TronWeb.
   * This is used when TronGrid API fails or is unavailable.
   */
  private async scanViaAlternativeRpc(
    chain: BlockchainNetwork,
    deposit: string,
    minTs: number,
  ): Promise<void> {
    try {
      const { TronWeb } = await import('tronweb');
      const fullHost = TRON_PUBLIC_RPC[chain];
      if (!fullHost) return;

      const tronWeb = new TronWeb({ fullHost });

      // Get recent transactions involving this address
      // TronWeb.getTransactionsRelated returns GetTransactionResponse[] directly
      const txInfo = await tronWeb.trx.getTransactionsRelated(deposit, 'all', 20);

      if (!Array.isArray(txInfo)) {
        this.logger.debug(`tron.deposit.watch.alt_rpc_no_txs chain=${chain}`);
        return;
      }

      const seenTx = new Set<string>();
      for (const tx of txInfo) {
        const txId = tx.txID?.trim();
        // TronWeb's GetTransactionResponse stores timestamp in raw_data
        const txRaw = tx as { block_timestamp?: number; raw_data?: { timestamp?: number } };
        const ts = txRaw.block_timestamp ?? txRaw.raw_data?.timestamp ?? 0;

        if (!txId || ts <= 0 || ts < minTs) continue;
        if (seenTx.has(txId)) continue;
        seenTx.add(txId);

        try {
          await this.ingestion.ingestTxHash(chain, txId);
        } catch (e) {
          this.logger.warn(
            `tron.deposit.watch.alt_rpc_ingest_failed tx=${txId} ${(e as Error).message}`,
          );
        }
      }

      this.logger.log(`tron.deposit.watch.alt_rpc_scanned chain=${chain} count=${seenTx.size}`);
    } catch (e) {
      this.logger.warn(`tron.deposit.watch.alt_rpc_error chain=${chain}: ${(e as Error).message}`);
    }
  }

  /**
   * Calculate the maximum timestamp for cursor update.
   * Tries to get recent transactions to find the latest timestamp.
   */
  private async calculateMaxTimestamp(
    chain: BlockchainNetwork,
    deposit: string,
    currentMinTs: number,
  ): Promise<number> {
    try {
      const { TronWeb } = await import('tronweb');
      const fullHost = TRON_PUBLIC_RPC[chain];
      if (!fullHost) return currentMinTs;

      const tronWeb = new TronWeb({ fullHost });
      const txInfo = await tronWeb.trx.getTransactionsRelated(deposit, 'all', 5);

      if (!Array.isArray(txInfo)) {
        return currentMinTs;
      }

      let maxTs = currentMinTs;
      for (const tx of txInfo) {
        const txRaw = tx as { block_timestamp?: number; raw_data?: { timestamp?: number } };
        const ts = txRaw.block_timestamp ?? txRaw.raw_data?.timestamp ?? 0;
        if (ts > maxTs) maxTs = ts;
      }
      return maxTs;
    } catch (e) {
      return currentMinTs;
    }
  }
}
