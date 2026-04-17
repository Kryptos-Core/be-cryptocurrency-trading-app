import { Injectable } from '@nestjs/common';
import { BaseCommand, BaseQuery, type ICommandHandler, type IQueryHandler } from '@/common/cqrs';
import type { BlockchainNetwork } from '@/common/enums';
import type { SubmitDepositDto } from '../../dto';
import { OnchainDepositService } from './deposits/onchain-deposit.service';

export class SubmitDepositCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: SubmitDepositDto,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class SubmitDepositUseCase
  implements
    ICommandHandler<
      SubmitDepositCommand,
      { txId: string; status: string; amount: string; chain: string; settled?: boolean }
    >
{
  constructor(private readonly depositService: OnchainDepositService) {}

  async execute(
    command: SubmitDepositCommand,
  ): Promise<{ txId: string; status: string; amount: string; chain: string; settled?: boolean }> {
    return this.depositService.submitDeposit(command.userId, command.dto);
  }
}

export class PreviewDepositQuery extends BaseQuery {
  constructor(
    public readonly userId: string,
    public readonly chain: BlockchainNetwork,
    public readonly txHash: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class PreviewDepositUseCase
  implements
    IQueryHandler<
      PreviewDepositQuery,
      {
        chain: string;
        txHash: string;
        status: string;
        confirmations: number;
        fromAddress: string;
        toAddress: string;
        onchainAmount: string;
        senderLinked: boolean;
      }
    >
{
  constructor(private readonly depositService: OnchainDepositService) {}

  async execute(command: PreviewDepositQuery): Promise<{
    chain: string;
    txHash: string;
    status: string;
    confirmations: number;
    fromAddress: string;
    toAddress: string;
    onchainAmount: string;
    senderLinked: boolean;
  }> {
    return this.depositService.previewDepositTx(command.userId, command.chain, command.txHash);
  }
}

export class SettleDepositCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly txId: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class SettleDepositUseCase
  implements
    ICommandHandler<
      SettleDepositCommand,
      { txId: string; status: string; settled: boolean; confirmations: number }
    >
{
  constructor(private readonly depositService: OnchainDepositService) {}

  async execute(
    command: SettleDepositCommand,
  ): Promise<{ txId: string; status: string; settled: boolean; confirmations: number }> {
    return this.depositService.settleDepositByTxId(command.userId, command.txId);
  }
}
