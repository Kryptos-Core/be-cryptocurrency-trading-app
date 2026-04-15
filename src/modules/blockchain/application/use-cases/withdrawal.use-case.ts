import { Injectable } from '@nestjs/common';
import { OnchainWithdrawalService } from '../../onchain-withdrawal.service';
import type { RequestWithdrawalDto } from '../../dto';

@Injectable()
export class RequestWithdrawalUseCase {
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(
    userId: string,
    dto: RequestWithdrawalDto,
  ): Promise<{
    txId: string;
    status: string;
    amount: string;
    chain: string;
    toAddress: string;
    reviewRequired?: boolean;
  }> {
    return this.withdrawalService.requestWithdrawal(userId, dto);
  }
}

@Injectable()
export class ApproveWithdrawalUseCase {
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(
    actorUserId: string,
    txId: string,
  ): Promise<{
    txId: string;
    status: string;
    amount: string;
    chain: string;
    toAddress: string;
    txHash: string | null;
  }> {
    return this.withdrawalService.approveManualWithdrawal(actorUserId, txId);
  }
}

@Injectable()
export class RejectWithdrawalUseCase {
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(
    actorUserId: string,
    txId: string,
    reason?: string,
  ): Promise<{ txId: string; status: string; reason?: string }> {
    return this.withdrawalService.rejectManualWithdrawal(actorUserId, txId, reason);
  }
}

@Injectable()
export class ProcessPendingWithdrawalsUseCase {
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(
    actorUserId: string,
    limit?: number,
  ): Promise<{
    processed: number;
    success: number;
    failed: number;
    items: Array<{ txId: string; status: string }>;
  }> {
    return this.withdrawalService.processPendingManualWithdrawals(actorUserId, limit);
  }
}
