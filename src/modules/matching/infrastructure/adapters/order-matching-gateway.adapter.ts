import { Injectable } from '@nestjs/common';
import {
  EnqueueMatchCommand,
  EnqueueMatchUseCase,
  ReconcileOpenOrdersForPairCommand,
  ReconcileOpenOrdersForPairUseCase,
  RemoveOrderFromBookCommand,
  RemoveOrderFromBookUseCase,
} from '@/modules/matching/application/use-cases';
import type { OrderBookOrder } from '@/modules/matching/interfaces/matching.interface';
import type {
  MatchingReconcileResultSnapshot,
  OrderBookOrderSnapshot,
  OrderMatchingGatewayPort,
} from '@/modules/orders/domain/ports/order-matching-gateway.port';

/**
 * Bridges orders → matching: implements orders port using matching use-cases.
 */
@Injectable()
export class OrderMatchingGatewayAdapter implements OrderMatchingGatewayPort {
  constructor(
    private readonly enqueueMatchUseCase: EnqueueMatchUseCase,
    private readonly removeOrderFromBookUseCase: RemoveOrderFromBookUseCase,
    private readonly reconcileOpenOrdersForPairUseCase: ReconcileOpenOrdersForPairUseCase,
  ) {}

  async enqueueMatch(input: {
    takerOrder: OrderBookOrderSnapshot;
    pairId: string;
    feeCurrencyId: string;
    makerFeeRate: string;
    takerFeeRate: string;
    slippageTolerance?: string;
  }): Promise<void> {
    await this.enqueueMatchUseCase.execute(
      new EnqueueMatchCommand(
        input.takerOrder as OrderBookOrder,
        input.pairId,
        input.feeCurrencyId,
        input.makerFeeRate,
        input.takerFeeRate,
        input.slippageTolerance,
      ),
    );
  }

  async removeOrderFromBook(pairId: string, orderId: string, side: 'BUY' | 'SELL'): Promise<boolean> {
    return this.removeOrderFromBookUseCase.execute(
      new RemoveOrderFromBookCommand(pairId, orderId, side),
    );
  }

  async reconcileOpenOrdersForPair(input: {
    pairId: string;
    feeCurrencyId: string;
    makerFeeRate: string;
    takerFeeRate: string;
  }): Promise<MatchingReconcileResultSnapshot> {
    const r = await this.reconcileOpenOrdersForPairUseCase.execute(
      new ReconcileOpenOrdersForPairCommand(
        input.pairId,
        input.feeCurrencyId,
        input.makerFeeRate,
        input.takerFeeRate,
      ),
    );
    return {
      pairId: r.pairId,
      tradesExecuted: r.tradesExecuted,
      matchRuns: r.matchRuns,
      openOrdersRemaining: r.openOrdersRemaining,
      stoppedReason: r.stoppedReason,
    };
  }
}
