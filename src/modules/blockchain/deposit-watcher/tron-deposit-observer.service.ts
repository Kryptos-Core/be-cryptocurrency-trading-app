import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainNetwork } from '@/common/enums';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import type { TronTreasuryNetwork } from '@/modules/treasury/treasury-tron-usdt-contracts';
import { TRON_USDT_CONTRACT } from '@/modules/treasury/treasury-tron-usdt-contracts';
import { tronContractAddressesEqual } from '../utils/tron-contract-address.util';
import { DepositIngestionService } from './deposit-ingestion.service';
import { DepositWatcherCursorRepository } from './deposit-watcher-cursor.repository';

/** TronGrid endpoints for mainnet (requires API key for higher rate limits) */
const TRON_GRID: Partial<Record<BlockchainNetwork, string>> = {
  [BlockchainNetwork.TRON_MAINNET]: 'https://api.trongrid.io',
  [BlockchainNetwork.TRON_NILE]: 'https://nile.trongrid.io',
  [BlockchainNetwork.TRON_SHASTA]: 'https://api.shasta.trongrid.io',
};

/** TronScan API endpoints for testnets (no API key required) */
const TRON_SCAN: Partial<Record<BlockchainNetwork, string>> = {
  [BlockchainNetwork.TRON_MAINNET]: 'https://apilist.tronscanapi.com',
  [BlockchainNetwork.TRON_NILE]: 'https://nileapi.tronscan.org',
  [BlockchainNetwork.TRON_SHASTA]: 'https://nileapi.tronscan.org', // Shasta uses Nile API
};

type TronGridTrc20Row = {
  transaction_id?: string;
  block_timestamp?: number;
  token_info?: { address?: string; symbol?: string };
};

type TronScanTrc20Row = {
  transaction_id?: string;
  block_ts?: number;
  contract_address?: string;
  to_address?: string;
  from_address?: string;
  confirmed?: boolean;
  tokenInfo?: { tokenAbbr?: string; tokenDecimal?: number };
};


/**
 * Poll TronScan/TronGrid for TRC-20 and native TRX transfers for the platform deposit address.
 * - Mainnet: TronGrid (with API key)
 * - Testnets (Nile/Shasta): TronScan API
 */
@Injectable()
export class TronDepositObserverService {
  private readonly logger = new Logger(TronDepositObserverService.name);
  private lastProcessedTimestamp = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly managedWalletsService: ManagedWalletsService,
    private readonly cursors: DepositWatcherCursorRepository,
    private readonly ingestion: DepositIngestionService,
  ) {}

  private tronGridApiKey(): string | undefined {
    return this.configService.get<string>('TRON_GRID_API_KEY')?.trim() || undefined;
  }

  private isTronScan(chain: BlockchainNetwork): boolean {
    return chain !== BlockchainNetwork.TRON_MAINNET;
  }

  private getApiBase(chain: BlockchainNetwork): string | undefined {
    if (this.isTronScan(chain)) {
      return TRON_SCAN[chain];
    }
    // Mainnet: require API key
    if (!this.tronGridApiKey()) {
      this.logger.warn('tron.deposit.watch.no_api_key_mainnet - TRON_GRID_API_KEY required for mainnet');
      return undefined;
    }
    return TRON_GRID[chain];
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const key = this.tronGridApiKey();
    if (key) headers['TRON-PRO-API-KEY'] = key;
    return headers;
  }

  async scanChain(chain: BlockchainNetwork): Promise<void> {
    // Reset state for this scan
    this.lastProcessedTimestamp = 0;

    if (
      chain !== BlockchainNetwork.TRON_MAINNET &&
      chain !== BlockchainNetwork.TRON_NILE &&
      chain !== BlockchainNetwork.TRON_SHASTA
    ) {
      return;
    }

    const base = this.getApiBase(chain);
    if (!base) return;

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

    const headers = this.getHeaders();

    // Scan TRC-20 token transfers
    await this.scanTrc20Transfers(chain, deposit, minTs, base, headers);

    // Scan native TRX transfers
    await this.scanNativeTransfers(chain, deposit, minTs, base, headers);

    // Update cursor to max timestamp of processed transactions, or keep existing
    const existingCursor = await this.cursors.findByChain(chain);
    const currentTs = existingCursor?.cursor_kind === 'TIMESTAMP_MS' ? Number(BigInt(existingCursor.cursor_value)) : 0;
    const maxProcessedTs = this.lastProcessedTimestamp ?? 0;
    const nextCursor = Math.max(currentTs, maxProcessedTs + 1);
    await this.cursors.upsertCursor(chain, BigInt(nextCursor), 'TIMESTAMP_MS');
  }

  /**
   * Scan TRC-20 token transfers.
   */
  private async scanTrc20Transfers(
    chain: BlockchainNetwork,
    deposit: string,
    minTs: number,
    base: string,
    headers: Record<string, string>,
  ): Promise<void> {
    try {
      let data: TronGridTrc20Row[] = [];

      if (this.isTronScan(chain)) {
        // TronScan API format
        const url = new URL('/api/token_trc20/transfers', base);
        url.searchParams.set('address', deposit);
        url.searchParams.set('limit', '40');
        url.searchParams.set('start_timestamp', String(minTs));
        url.searchParams.set('order_by', 'block_timestamp,asc');

        this.logger.debug(`tron.deposit.watch.scanning chain=${chain} url=${url.toString()}`);
        const res = await fetch(url.toString(), { headers });
        if (!res.ok) {
          this.logger.warn(`tron.deposit.watch.trc20_http_error chain=${chain} status=${res.status}`);
          return;
        }

        const body = (await res.json()) as { token_transfers?: TronScanTrc20Row[] };
        const tronscanData = Array.isArray(body.token_transfers) ? body.token_transfers : [];

        if (tronscanData.length === 0) {
          this.logger.debug(`tron.deposit.watch.trc20_no_txs chain=${chain} minTs=${minTs}`);
          return;
        }

        // Convert TronScan format to common format
        data = tronscanData
          .filter((row) => {
            return row.confirmed && row.to_address?.toLowerCase() === deposit.toLowerCase();
          })
          .map((row) => ({
            transaction_id: row.transaction_id,
            block_timestamp: row.block_ts,
            token_info: {
              address: row.contract_address,
              symbol: row.tokenInfo?.tokenAbbr,
            },
          }));
      } else {
        // TronGrid API format
        const url = new URL(`/v1/accounts/${encodeURIComponent(deposit)}/transactions/trc20`, base);
        url.searchParams.set('only_confirmed', 'true');
        url.searchParams.set('limit', '40');
        url.searchParams.set('order_by', 'block_timestamp,asc');
        url.searchParams.set('min_timestamp', String(minTs));

        const res = await fetch(url.toString(), { headers });
        if (!res.ok) {
          this.logger.warn(`tron.deposit.watch.trc20_http_error chain=${chain} status=${res.status}`);
          return;
        }

        const body = (await res.json()) as { data?: TronGridTrc20Row[] };
        data = Array.isArray(body.data) ? body.data : [];

        if (data.length === 0) {
          this.logger.debug(`tron.deposit.watch.trc20_no_txs chain=${chain} minTs=${minTs}`);
          return;
        }
      }

      const tronNet: TronTreasuryNetwork =
        chain === BlockchainNetwork.TRON_MAINNET
          ? 'TRON_MAINNET'
          : chain === BlockchainNetwork.TRON_SHASTA
            ? 'TRON_SHASTA'
            : 'TRON_NILE';
      const usdtContract = TRON_USDT_CONTRACT[tronNet];

      let maxTs = 0;
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

      // Track max timestamp for cursor update
      if (maxTs > this.lastProcessedTimestamp) {
        this.lastProcessedTimestamp = maxTs;
      }
    } catch (e) {
      this.logger.warn(`tron.deposit.watch.trc20_error chain=${chain}: ${(e as Error).message}`);
    }
  }

  /**
   * Scan native TRX transfers.
   */
  private async scanNativeTransfers(
    chain: BlockchainNetwork,
    deposit: string,
    minTs: number,
    base: string,
    headers: Record<string, string>,
  ): Promise<void> {
    // TronScan testnets don't support native TRX transfer API, skip
    if (this.isTronScan(chain)) {
      this.logger.debug(`tron.deposit.watch.skip_native_testnet chain=${chain}`);
      return;
    }

    try {
      const nativeUrl = new URL(`/v1/accounts/${encodeURIComponent(deposit)}/transactions`, base);
      nativeUrl.searchParams.set('only_confirmed', 'true');
      nativeUrl.searchParams.set('limit', '25');
      nativeUrl.searchParams.set('order_by', 'block_timestamp,asc');
      nativeUrl.searchParams.set('min_timestamp', String(minTs));

      const resNative = await fetch(nativeUrl.toString(), { headers });
      if (!resNative.ok) {
        this.logger.warn(`tron.deposit.watch.native_http_error chain=${chain} status=${resNative.status}`);
        return;
      }

      const nativeBody = (await resNative.json()) as { data?: { txID?: string; block_timestamp?: number }[] };
      const nativeRows = Array.isArray(nativeBody.data) ? nativeBody.data : [];

      if (nativeRows.length === 0) {
        this.logger.debug(`tron.deposit.watch.native_no_txs chain=${chain} minTs=${minTs}`);
        return;
      }

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
          this.logger.warn(`tron.deposit.watch.ingest_failed_native tx=${txId} ${(e as Error).message}`);
        }
      }
    } catch (e) {
      this.logger.warn(`tron.deposit.watch.native_error chain=${chain}: ${(e as Error).message}`);
    }
  }
}
