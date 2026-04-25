import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TransactionContext } from '@/common/types/transaction-context';
import { WalletReferenceType } from '@/common/enums';
import { BadRequestException, BusinessException } from '@/common/exceptions';
import {
  EXCHANGE_SERVICE_PORT,
  type ExchangeServicePort,
  WALLET_LEDGER_REPOSITORY,
  WALLET_REPOSITORY,
  type WalletLedgerRepositoryPort,
  type WalletRepositoryPort,
} from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';

export interface ReconcileResult {
  internalBalance: string;
  externalBalance: string;
  discrepancy: string;
  status: string;
}

@Injectable()
export class ReconcileBalanceUseCase {
  private readonly logger = new Logger(ReconcileBalanceUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledgerRepo: WalletLedgerRepositoryPort,
    @Inject(EXCHANGE_SERVICE_PORT) private readonly exchangeService: ExchangeServicePort,
    private readonly balanceCalc: BalanceCalculationService,
  ) {}

  async execute(userId: string, currencyId: string, manager?: TransactionContext): Promise<ReconcileResult> {
    const wallet = await this.walletRepo.findByUserCurrency(userId, currencyId);
    if (!wallet) {
      throw new BadRequestException(
        `Wallet not found for user ${userId} and currency ${currencyId}`,
      );
    }

    const internalBalance = wallet.available ?? '0';

    let externalBalance = '0';
    try {
      const exchangeBalance = await this.exchangeService.getBalance('USDT');
      externalBalance = exchangeBalance.available ?? '0';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BusinessException(`Failed to get balance from exchange: ${errorMessage}`);
    }

    const { discrepancy, status } = this.balanceCalc.computeDiscrepancy(
      internalBalance,
      externalBalance,
    );

    try {
      await this.ledgerRepo.createEntry(
        {
          userId,
          currencyId,
          refType: WalletReferenceType.RECONCILIATION,
          refId: 0,
          direction: discrepancy.isPositive() ? 'CREDIT' : 'DEBIT',
          amount: discrepancy.abs().toString(),
          balanceAfter: externalBalance,
        },
        manager,
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('Duplicate entry')) {
        this.logger.error(`[Reconciliation] Unexpected error: ${errorMessage}`);
        throw error;
      }
      this.logger.debug(
        `[Reconciliation] Entry already exists for user ${userId}, currency ${currencyId}`,
      );
    }

    this.logger.log(
      `[Reconciliation] User ${userId}, Currency ${currencyId}: Internal=${internalBalance}, External=${externalBalance}, Diff=${discrepancy}`,
    );

    return {
      internalBalance,
      externalBalance,
      discrepancy: discrepancy.toString(),
      status,
    };
  }
}
