import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import type { MatchOrderJobData } from '../../infrastructure/queue/matching-queue.service';
import { MatchingQueueService } from '../../infrastructure/queue/matching-queue.service';
import { MatchingService } from '../../domain/services/matching.service';

export class EnqueueMatchCommand extends BaseCommand implements MatchOrderJobData {
  constructor(
    public readonly takerOrder: MatchOrderJobData['takerOrder'],
    public readonly pairId: string,
    public readonly feeCurrencyId: string,
    public readonly makerFeeRate: string,
    public readonly takerFeeRate: string,
    public readonly slippageTolerance?: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class EnqueueMatchUseCase implements ICommandHandler<EnqueueMatchCommand, void> {
  constructor(private readonly matchingQueueService: MatchingQueueService) {}

  async execute(command: EnqueueMatchCommand): Promise<void> {
    await this.matchingQueueService.enqueueMatch({
      takerOrder: command.takerOrder,
      pairId: command.pairId,
      feeCurrencyId: command.feeCurrencyId,
      makerFeeRate: command.makerFeeRate,
      takerFeeRate: command.takerFeeRate,
      slippageTolerance: command.slippageTolerance,
    });
  }
}

export class RunMatchCommand extends BaseCommand implements MatchOrderJobData {
  constructor(
    public readonly takerOrder: MatchOrderJobData['takerOrder'],
    public readonly pairId: string,
    public readonly feeCurrencyId: string,
    public readonly makerFeeRate: string,
    public readonly takerFeeRate: string,
    public readonly slippageTolerance?: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class RunMatchUseCase
  implements ICommandHandler<RunMatchCommand, Awaited<ReturnType<MatchingService['runMatch']>>>
{
  constructor(private readonly matchingService: MatchingService) {}

  async execute(command: RunMatchCommand) {
    return this.matchingService.runMatch({
      takerOrder: command.takerOrder,
      pairId: command.pairId,
      feeCurrencyId: command.feeCurrencyId,
      makerFeeRate: command.makerFeeRate,
      takerFeeRate: command.takerFeeRate,
      slippageTolerance: command.slippageTolerance,
    });
  }
}

export class RemoveOrderFromBookCommand extends BaseCommand {
  constructor(
    public readonly pairId: string,
    public readonly orderId: string,
    public readonly side: 'BUY' | 'SELL',
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class RemoveOrderFromBookUseCase
  implements ICommandHandler<RemoveOrderFromBookCommand, boolean>
{
  constructor(private readonly matchingService: MatchingService) {}

  async execute(command: RemoveOrderFromBookCommand): Promise<boolean> {
    return this.matchingService.removeOrderFromBook(command.pairId, command.orderId, command.side);
  }
}

export class ReconcileOpenOrdersForPairCommand extends BaseCommand {
  constructor(
    public readonly pairId: string,
    public readonly feeCurrencyId: string,
    public readonly makerFeeRate: string,
    public readonly takerFeeRate: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class ReconcileOpenOrdersForPairUseCase
  implements
    ICommandHandler<
      ReconcileOpenOrdersForPairCommand,
      Awaited<ReturnType<MatchingService['reconcileOpenOrdersForPair']>>
    >
{
  constructor(private readonly matchingService: MatchingService) {}

  async execute(command: ReconcileOpenOrdersForPairCommand) {
    return this.matchingService.reconcileOpenOrdersForPair({
      pairId: command.pairId,
      feeCurrencyId: command.feeCurrencyId,
      makerFeeRate: command.makerFeeRate,
      takerFeeRate: command.takerFeeRate,
    });
  }
}
