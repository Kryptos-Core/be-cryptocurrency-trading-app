import { Injectable, Logger } from '@nestjs/common';
import { BlockchainNetwork } from '@/common/enums';
import { EVM_USDT_CONTRACT, evmUsdtDecimals } from '@/common/constants/evm-usdt-contracts';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import { BlockchainProviderFactory } from '../blockchain-provider.factory';
import { EthereumProvider } from '../infrastructure/providers/ethereum.provider';
import { DepositWatcherCursorRepository } from './deposit-watcher-cursor.repository';
import { DepositIngestionService } from './deposit-ingestion.service';
import { DepositWatcherConfigService } from './deposit-watcher-config.service';

function isEthereumProvider(p: unknown): p is EthereumProvider {
  return typeof p === 'object' && p !== null && typeof (p as EthereumProvider).scanUsdtTransfersToDeposit === 'function';
}

@Injectable()
export class EvmDepositObserverService {
  private readonly logger = new Logger(EvmDepositObserverService.name);

  constructor(
    private readonly factory: BlockchainProviderFactory,
    private readonly managedWalletsService: ManagedWalletsService,
    private readonly cursors: DepositWatcherCursorRepository,
    private readonly ingestion: DepositIngestionService,
    private readonly cfg: DepositWatcherConfigService,
  ) {}

  async scanChain(chain: BlockchainNetwork): Promise<void> {
    const usdt = EVM_USDT_CONTRACT[chain];
    if (!usdt) return;

    const prov = this.factory.getProvider(chain);
    if (!isEthereumProvider(prov)) return;

    const deposit = (await this.managedWalletsService.getPublicDepositRecipientAddress(chain))?.trim();
    if (!deposit) {
      this.logger.debug(`evm.deposit.watch.skip_no_address chain=${chain}`);
      return;
    }

    const confirmations = await this.cfg.getEvmMinConfirmations();
    const chunk = await this.cfg.getEvmBlockChunk();
    const initialLookback = await this.cfg.getEvmInitialLookbackBlocks();

    const latest = await prov.getLatestBlockNumber();
    const safeLatest = latest - confirmations;
    if (safeLatest < 1) return;

    const row = await this.cursors.findByChain(chain);
    let fromBlock =
      row?.cursor_kind === 'BLOCK_NUMBER' ? Number(BigInt(row.cursor_value || '0')) : safeLatest - initialLookback;
    if (!Number.isFinite(fromBlock) || fromBlock < 1) fromBlock = 1;
    fromBlock = Math.min(fromBlock, safeLatest);

    let cursorEnd = fromBlock > 0 ? fromBlock - 1 : 0;
    const decimals = evmUsdtDecimals(chain);

    for (let start = fromBlock; start <= safeLatest; start += chunk) {
      const end = Math.min(safeLatest, start + chunk - 1);
      const transfers = await prov.scanUsdtTransfersToDeposit({
        fromBlock: start,
        toBlock: end,
        depositAddress: deposit,
        usdtContract: usdt,
        decimals,
      });
      cursorEnd = end;
      for (const t of transfers) {
        try {
          await this.ingestion.ingestTxHash(chain, t.txHash, t.logIndex);
        } catch (e) {
          this.logger.warn(
            `evm.deposit.watch.ingest_failed chain=${chain} tx=${t.txHash} log=${t.logIndex} ${(e as Error).message}`,
          );
        }
      }
    }

    await this.cursors.upsertCursor(chain, BigInt(cursorEnd), 'BLOCK_NUMBER');
    this.logger.log(
      JSON.stringify({
        domain: 'treasury',
        event: 'deposit.watcher.evm_scan.done',
        chain,
        fromBlock,
        safeLatest,
        cursorEnd,
      }),
    );
  }
}
