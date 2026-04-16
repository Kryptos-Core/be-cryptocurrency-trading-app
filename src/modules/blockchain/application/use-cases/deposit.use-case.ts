import { Injectable } from '@nestjs/common';
import type { BlockchainNetwork } from '@/common/enums';
import type { SubmitDepositDto } from '../../dto';
import { OnchainDepositService } from '../../onchain-deposit.service';

@Injectable()
export class SubmitDepositUseCase {
  constructor(private readonly depositService: OnchainDepositService) {}

  async execute(
    userId: string,
    dto: SubmitDepositDto,
  ): Promise<{ txId: string; status: string; amount: string; chain: string; settled?: boolean }> {
    return this.depositService.submitDeposit(userId, dto);
  }
}

@Injectable()
export class PreviewDepositUseCase {
  constructor(private readonly depositService: OnchainDepositService) {}

  async execute(
    userId: string,
    chain: BlockchainNetwork,
    txHash: string,
  ): Promise<{
    chain: string;
    txHash: string;
    status: string;
    confirmations: number;
    fromAddress: string;
    toAddress: string;
    onchainAmount: string;
    senderLinked: boolean;
  }> {
    return this.depositService.previewDepositTx(userId, chain, txHash);
  }
}

@Injectable()
export class SettleDepositUseCase {
  constructor(private readonly depositService: OnchainDepositService) {}

  async execute(
    userId: string,
    txId: string,
  ): Promise<{ txId: string; status: string; settled: boolean; confirmations: number }> {
    return this.depositService.settleDepositByTxId(userId, txId);
  }
}
