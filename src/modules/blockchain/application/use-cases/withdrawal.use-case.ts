import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import type { ManualWithdrawalActionDto, RequestWithdrawalDto } from '../../dto';
import { OnchainWithdrawalService } from '../services/withdrawals/onchain-withdrawal.service';

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
  implements ICommandHandler<RequestWithdrawalCommand, Awaited<ReturnType<OnchainWithdrawalService['requestWithdrawal']>>>
{
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(command: RequestWithdrawalCommand) {
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
  implements ICommandHandler<ApproveWithdrawalCommand, Awaited<ReturnType<OnchainWithdrawalService['approveManualWithdrawal']>>>
{
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(command: ApproveWithdrawalCommand) {
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
  implements ICommandHandler<RejectWithdrawalCommand, Awaited<ReturnType<OnchainWithdrawalService['rejectManualWithdrawal']>>>
{
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(command: RejectWithdrawalCommand) {
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
    public readonly limit: number,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class ProcessPendingWithdrawalsUseCase
  implements ICommandHandler<ProcessPendingWithdrawalsCommand, Awaited<ReturnType<OnchainWithdrawalService['processPendingManualWithdrawals']>>>
{
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(command: ProcessPendingWithdrawalsCommand) {
    return this.withdrawalService.processPendingManualWithdrawals(
      command.actorUserId,
      command.limit,
    );
  }
}
