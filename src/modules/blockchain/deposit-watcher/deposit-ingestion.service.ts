import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { BlockchainNetwork } from '@/common/enums';
import { ConflictException } from '@/common/exceptions';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import { OnchainDepositService } from '../application/use-cases/deposits/onchain-deposit.service';
import { WalletLinkingService } from '../application/use-cases/wallet-linking/wallet-linking.service';
import { BlockchainProviderFactory } from '../blockchain-provider.factory';
import { DEPOSIT_INGESTION_SERVICE } from './deposit-ingestion.token';

/**
 * Maps observed on-chain activity to linked users and idempotent deposit rows.
 */
@Injectable()
export class DepositIngestionService {
  private readonly logger = new Logger(DepositIngestionService.name);

  constructor(
    private readonly providerFactory: BlockchainProviderFactory,
    private readonly managedWalletsService: ManagedWalletsService,
    private readonly walletLinkingService: WalletLinkingService,
    private readonly onchainDepositService: OnchainDepositService,
  ) {}

  /**
   * Resolve legs for a tx hash and ingest the first linked sender (USDT preferred over native).
   * When [logIndex] is set (EVM), only that leg is considered.
   * If no sender wallet is linked to any user, creates an UNMATCHED record so ops can manually match.
   */
  async ingestTxHash(chain: BlockchainNetwork, txHash: string, logIndex?: number): Promise<void> {
    const expected = (
      await this.managedWalletsService.getPublicDepositRecipientAddress(chain)
    )?.trim();
    if (!expected) {
      this.logger.debug(`deposit.ingest.skip_no_recipient chain=${chain}`);
      return;
    }

    const provider = this.providerFactory.getProvider(chain);
    const legs = await provider.resolveDepositTransfers(txHash, {
      expectedDepositAddress: expected,
    });
    const filtered = logIndex === undefined ? legs : legs.filter((l) => l.logIndex === logIndex);
    if (filtered.length === 0) {
      this.logger.debug(
        `deposit.ingest.skip_no_leg chain=${chain} tx=${txHash} log=${logIndex ?? 'any'}`,
      );
      return;
    }

    const rank = (a: (typeof legs)[0]) =>
      a.asset === 'USDT_TRC20' || a.asset === 'USDT_ERC20' ? 0 : 1;
    const ordered = [...filtered].sort((a, b) => rank(a) - rank(b));

    for (const leg of ordered) {
      const link = await this.walletLinkingService.findVerifiedWalletByChainAndAddress(
        chain,
        leg.from,
      );

      if (!link?.user_id) {
        // Sender not linked — persist an UNMATCHED record for admin resolution.
        try {
          await this.onchainDepositService.ingestUnmatchedDeposit(leg);
          this.logger.warn(
            JSON.stringify({
              domain: 'treasury',
              event: 'deposit.ingest.unmatched',
              chain,
              txHash,
              from: leg.from,
              amount: leg.amountHuman,
            }),
          );
        } catch (err) {
          if (err instanceof ConflictException) {
            // Already recorded as UNMATCHED on a previous attempt.
            return;
          }
          this.logger.warn(
            `deposit.ingest.unmatched_failed chain=${chain} tx=${txHash} from=${leg.from} ${(err as Error).message}`,
          );
        }
        continue;
      }

      try {
        const result = await this.onchainDepositService.ingestIncomingDepositForUser(
          String(link.user_id),
          leg,
        );
        if (result) {
          this.logger.log(
            JSON.stringify({
              domain: 'treasury',
              event: 'deposit.ingest.success',
              chain,
              txHash,
              userId: link.user_id,
              amount: result.amount,
            }),
          );
        }
        return;
      } catch (err) {
        if (err instanceof ConflictException) {
          return;
        }
        this.logger.warn(
          `deposit.ingest.failed chain=${chain} tx=${txHash} user=${link.user_id} ${(err as Error).message}`,
        );
      }
    }
  }
}
