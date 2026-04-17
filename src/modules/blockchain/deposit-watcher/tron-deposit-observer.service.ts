import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainNetwork } from '@/common/enums';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import type { TronTreasuryNetwork } from '@/modules/treasury/treasury-tron-usdt-contracts';
import { TRON_USDT_CONTRACT } from '@/modules/treasury/treasury-tron-usdt-contracts';
import { tronContractAddressesEqual } from '../utils/tron-contract-address.util';
import { DepositWatcherCursorRepository } from './deposit-watcher-cursor.repository';
import { DepositIngestionService } from './deposit-ingestion.service';

const TRON_GRID: Partial<Record<BlockchainNetwork, string>> = {
  [BlockchainNetwork.TRON_MAINNET]: 'https://api.trongrid.io',
  [BlockchainNetwork.TRON_NILE]: 'https://nile.trongrid.io',
  [BlockchainNetwork.TRON_SHASTA]: 'https://api.shasta.trongrid.io',
};

type TronGridTrc20Row = {
  transaction_id?: string;
  block_timestamp?: number;
  token_info?: { address?: string; symbol?: string };
};

/**
 * Poll TronGrid TRC-20 history for the platform deposit address and enqueue new tx hashes for ingestion.
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

  async scanChain(chain: BlockchainNetwork): Promise<void> {
    if (
      chain !== BlockchainNetwork.TRON_MAINNET &&
      chain !== BlockchainNetwork.TRON_NILE &&
      chain !== BlockchainNetwork.TRON_SHASTA
    ) {
      return;
    }

    const deposit = (await this.managedWalletsService.getPublicDepositRecipientAddress(chain))?.trim();
    if (!deposit) {
      this.logger.debug(`tron.deposit.watch.skip_no_address chain=${chain}`);
      return;
    }

    const row = await this.cursors.findByChain(chain);
    let minTs = row?.cursor_kind === 'TIMESTAMP_MS' ? Number(BigInt(row.cursor_value)) : 0;
    if (minTs <= 0) {
      minTs = Math.max(0, Date.now() - 86400000 * 7);
    }

    const base = TRON_GRID[chain];
    if (!base) return;
    const url = new URL(`/v1/accounts/${encodeURIComponent(deposit)}/transactions/trc20`, base);
    url.searchParams.set('only_confirmed', 'true');
    url.searchParams.set('limit', '40');
    url.searchParams.set('order_by', 'block_timestamp,asc');
    url.searchParams.set('min_timestamp', String(minTs));

    const headers: Record<string, string> = { Accept: 'application/json' };
    const key = this.tronGridApiKey();
    if (key) headers['TRON-PRO-API-KEY'] = key;

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      this.logger.warn(`tron.deposit.watch.http_error chain=${chain} status=${res.status}`);
      return;
    }

    const body = (await res.json()) as { data?: TronGridTrc20Row[] };
    const data = Array.isArray(body.data) ? body.data : [];
    let maxTs = minTs;
    const tronNet: TronTreasuryNetwork =
      chain === BlockchainNetwork.TRON_MAINNET
        ? 'TRON_MAINNET'
        : chain === BlockchainNetwork.TRON_SHASTA
          ? 'TRON_SHASTA'
          : 'TRON_NILE';
    const usdtContract = TRON_USDT_CONTRACT[tronNet];

    const nativeUrl = new URL(`/v1/accounts/${encodeURIComponent(deposit)}/transactions`, base);
    nativeUrl.searchParams.set('only_confirmed', 'true');
    nativeUrl.searchParams.set('limit', '25');
    nativeUrl.searchParams.set('order_by', 'block_timestamp,asc');
    nativeUrl.searchParams.set('min_timestamp', String(minTs));
    const resNative = await fetch(nativeUrl.toString(), { headers });
    const nativeBody = resNative.ok ? ((await resNative.json()) as { data?: { txID?: string; block_timestamp?: number }[] }) : { data: [] };
    const nativeRows = Array.isArray(nativeBody.data) ? nativeBody.data : [];

    const seenTx = new Set<string>();
    for (const item of data) {
      const txId = item.transaction_id?.trim();
      const ts = item.block_timestamp ?? 0;
      if (!txId || ts <= 0) continue;
      if (ts > maxTs) maxTs = ts;

      const tokenAddr = item.token_info?.address?.trim();
      if (usdtContract && tokenAddr && !tronContractAddressesEqual(tokenAddr, usdtContract)) {
        continue;
      }

      if (seenTx.has(txId)) continue;
      seenTx.add(txId);

      try {
        await this.ingestion.ingestTxHash(chain, txId);
      } catch (e) {
        this.logger.warn(`tron.deposit.watch.ingest_failed tx=${txId} ${(e as Error).message}`);
      }
    }

    for (const tx of nativeRows) {
      const txId = (tx.txID ?? (tx as { transaction_id?: string }).transaction_id)?.trim();
      const ts = tx.block_timestamp ?? 0;
      if (!txId || ts <= 0) continue;
      if (ts > maxTs) maxTs = ts;
      if (seenTx.has(txId)) continue;
      seenTx.add(txId);
      try {
        await this.ingestion.ingestTxHash(chain, txId);
      } catch (e) {
        this.logger.warn(`tron.deposit.watch.ingest_failed_native tx=${txId} ${(e as Error).message}`);
      }
    }

    const nextCursor = BigInt(maxTs + 1);
    await this.cursors.upsertCursor(chain, nextCursor, 'TIMESTAMP_MS');
  }
}
