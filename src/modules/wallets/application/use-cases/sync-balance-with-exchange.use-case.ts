import { Inject, Injectable, Logger } from '@nestjs/common';
import { BadRequestException, BusinessException } from '@/common/exceptions';
import {
  WALLET_REPOSITORY,
  type WalletRepositoryPort,
  EXCHANGE_SERVICE_PORT,
  type ExchangeServicePort,
} from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';
import type { WalletBalanceDto } from '@/modules/wallets/dto/wallet-balance.dto';

@Injectable()
export class SyncBalanceWithExchangeUseCase {
  private readonly logger = new Logger(SyncBalanceWithExchangeUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(EXCHANGE_SERVICE_PORT) private readonly exchangeService: ExchangeServicePort,
    private readonly balanceCalc: BalanceCalculationService,
  ) {}

  async execute(userId: string, currencyId: string): Promise<WalletBalanceDto> {
    const wallet = await this.walletRepo.findByUserCurrency(userId, currencyId);
    if (!wallet) {
      throw new BadRequestException(
        `Wallet not found for user ${userId} and currency ${currencyId}`,
      );
    }

    try {
      const exchangeBalance = await this.exchangeService.getBalance('USDT');
      this.logger.debug(`[Binance] Got balance: ${JSON.stringify(exchangeBalance)}`);

      const available = exchangeBalance.available ?? '0';
      const frozen = exchangeBalance.frozen ?? '0';

      return this.balanceCalc.buildBalanceSnapshot(userId, currencyId, available, frozen);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Binance] Balance sync failed: ${errorMessage}`);
      throw new BusinessException(`Failed to sync balance with exchange: ${errorMessage}`);
    }
  }
}
