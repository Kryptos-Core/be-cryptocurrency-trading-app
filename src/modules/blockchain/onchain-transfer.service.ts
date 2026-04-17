import { Injectable } from '@nestjs/common';
import type { BlockchainNetwork } from '@/common/enums';
import { runInSpan } from '@/common/telemetry';
import { OnchainTransferQueryService } from './application/queries/transactions/onchain-transfer-query.service';
import { OnchainDepositService } from './application/use-cases/deposits/onchain-deposit.service';
import { OnchainWithdrawalService } from './application/use-cases/withdrawals/onchain-withdrawal.service';
import type { RequestWithdrawalDto, SubmitDepositDto } from './dto';

@Injectable()
export class OnchainTransferService {
  constructor(
    private readonly depositService: OnchainDepositService,
    private readonly withdrawalService: OnchainWithdrawalService,
    private readonly queryService: OnchainTransferQueryService,
  ) {}

  async previewDepositTx(userId: string, chain: BlockchainNetwork, txHash: string) {
    return this.depositService.previewDepositTx(userId, chain, txHash);
  }

  async submitDeposit(userId: string, dto: SubmitDepositDto) {
    return this.depositService.submitDeposit(userId, dto);
  }

  async settleDepositByTxId(userId: string, txId: string) {
    return this.depositService.settleDepositByTxId(userId, txId);
  }

  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    return runInSpan(
      'Blockchain.requestWithdrawal',
      () => this.withdrawalService.requestWithdrawal(userId, dto),
      { module: 'blockchain', userId },
    );
  }
}
