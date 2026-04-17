import { Inject, Injectable } from '@nestjs/common';
import { nativeSymbolForChain } from '@/common/constants/chain-registry';
import { BlockchainNetwork } from '@/common/enums';
import { BadRequestException } from '@/common/exceptions';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import {
  type AdminWithdrawalFilters,
  ONCHAIN_TRANSACTION_REPOSITORY,
  type OnchainTransactionRepositoryPort,
} from '../../../domain/ports';

@Injectable()
export class OnchainTransferQueryService {
  constructor(
    @Inject(ONCHAIN_TRANSACTION_REPOSITORY)
    private readonly onchainTxRepo: OnchainTransactionRepositoryPort,
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepository: CurrencyRepositoryPort,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async getTransactions(userId: string, limit: number = 50) {
    return this.onchainTxRepo.listByUser(userId, limit);
  }

  async getTransactionById(userId: string, txId: string) {
    const tx = await this.onchainTxRepo.getByIdAndUser(userId, txId);
    if (!tx) throw new BadRequestException('Giao dịch không tìm thấy', 'TX_NOT_FOUND');
    return tx;
  }

  async getAdminWithdrawals(filters: AdminWithdrawalFilters) {
    return this.onchainTxRepo.listAdminWithdrawals(filters);
  }

  async getAdminWithdrawalById(txId: string) {
    const detail = await this.onchainTxRepo.getAdminWithdrawalDetail(txId);
    if (!detail) {
      throw new BadRequestException('Giao dịch rút tiền không tìm thấy', 'TX_NOT_FOUND');
    }
    return detail;
  }

  async getAdminWithdrawalStats() {
    return this.onchainTxRepo.getWithdrawalStats();
  }

  private async getChainAssetSymbol(chain: BlockchainNetwork): Promise<string> {
    let base: string;
    try {
      base = nativeSymbolForChain(chain);
    } catch {
      throw new BadRequestException('Mạng blockchain không được hỗ trợ', 'CHAIN_NOT_SUPPORTED');
    }
    const keyByBase: Record<string, string> = {
      ETH: 'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL',
      BNB: 'BLOCKCHAIN_WITHDRAW_BNB_SYMBOL',
      SOL: 'BLOCKCHAIN_WITHDRAW_SOL_SYMBOL',
      TRX: 'BLOCKCHAIN_WITHDRAW_TRON_SYMBOL',
      POL: 'BLOCKCHAIN_WITHDRAW_POL_SYMBOL',
      AVAX: 'BLOCKCHAIN_WITHDRAW_AVAX_SYMBOL',
      XDAI: 'BLOCKCHAIN_WITHDRAW_XDAI_SYMBOL',
      FTM: 'BLOCKCHAIN_WITHDRAW_FTM_SYMBOL',
    };
    const cfgKey = keyByBase[base];
    if (cfgKey) {
      const o = (await this.systemConfigService.get<string>(cfgKey))?.trim().toUpperCase();
      if (o) return o;
    }
    return base;
  }

  async resolveWithdrawalCurrencyId(chain: BlockchainNetwork): Promise<string> {
    const symbol = await this.getChainAssetSymbol(chain);
    const currency = await this.currencyRepository.findBySymbol(symbol);
    if (!currency?.currency_id) {
      throw new BadRequestException(
        `Không tìm thấy currency ${symbol} để xử lý rút tiền`,
        'WITHDRAWAL_CURRENCY_NOT_FOUND',
      );
    }
    return String(currency.currency_id);
  }
}
