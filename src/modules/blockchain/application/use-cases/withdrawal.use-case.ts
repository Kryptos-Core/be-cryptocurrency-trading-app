import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import type { RequestWithdrawalDto } from '../../dto';
import { OnchainWithdrawalService } from '../../onchain-withdrawal.service';

export class RequestWithdrawalCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: RequestWithdrawalDto,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class RequestWithdrawalUseCase
  implements
    ICommandHandler<
      RequestWithdrawalCommand,
      {
        txId: string;
        status: string;
        amount: string;
        chain: string;
        toAddress: string;
        reviewRequired?: boolean;
      }
    >
{
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(command: RequestWithdrawalCommand): Promise<{
    txId: string;
    status: string;
    amount: string;
    chain: string;
    toAddress: string;
    reviewRequired?: boolean;
  }> {
    return this.withdrawalService.requestWithdrawal(command.userId, command.dto);
  }
}

export class ApproveWithdrawalCommand extends BaseCommand {
  constructor(
    public readonly actorUserId: string,
    public readonly txId: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class ApproveWithdrawalUseCase
  implements
    ICommandHandler<
      ApproveWithdrawalCommand,
      {
        txId: string;
        status: string;
        amount: string;
        chain: string;
        toAddress: string;
        txHash: string | null;
      }
    >
{
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(command: ApproveWithdrawalCommand): Promise<{
    txId: string;
    status: string;
    amount: string;
    chain: string;
    toAddress: string;
    txHash: string | null;
  }> {
    return this.withdrawalService.approveManualWithdrawal(command.actorUserId, command.txId);
  }
}

export class RejectWithdrawalCommand extends BaseCommand {
  constructor(
    public readonly actorUserId: string,
    public readonly txId: string,
    public readonly reason?: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class RejectWithdrawalUseCase
  implements ICommandHandler<RejectWithdrawalCommand, { txId: string; status: string; reason?: string }>
{
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(
    command: RejectWithdrawalCommand,
  ): Promise<{ txId: string; status: string; reason?: string }> {
    return this.withdrawalService.rejectManualWithdrawal(
      command.actorUserId,
      command.txId,
      command.reason,
    );
  }
}

export class ProcessPendingWithdrawalsCommand extends BaseCommand {
  constructor(
    public readonly actorUserId: string,
    public readonly limit?: number,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class ProcessPendingWithdrawalsUseCase
  implements
    ICommandHandler<
      ProcessPendingWithdrawalsCommand,
      {
        processed: number;
        success: number;
        failed: number;
        items: Array<{ txId: string; status: string }>;
      }
    >
{
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(command: ProcessPendingWithdrawalsCommand): Promise<{
    processed: number;
    success: number;
    failed: number;
    items: Array<{ txId: string; status: string }>;
  }> {
    return this.withdrawalService.processPendingManualWithdrawals(
      command.actorUserId,
      command.limit,
    );
  }
}
