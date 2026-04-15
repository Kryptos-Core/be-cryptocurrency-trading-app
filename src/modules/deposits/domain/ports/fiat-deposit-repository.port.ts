import type { EntityManager } from 'typeorm';
import type { FiatDeposit } from '@/entities/fiat-deposit.entity';

export interface FiatDepositRepositoryPort {
  createDeposit(
    depositId: string,
    userId: string,
    amount: string,
    orderCode: number,
    checkoutUrl: string,
    manager?: EntityManager,
  ): Promise<FiatDeposit>;
  updateStatus(
    orderCode: number,
    status: 'PENDING' | 'PAID' | 'CANCELLED',
    manager?: EntityManager,
  ): Promise<FiatDeposit>;
  findByOrderCode(orderCode: number): Promise<FiatDeposit | null>;
  findByUser(userId: string): Promise<FiatDeposit[]>;
  findAllForAdmin(params: {
    userId?: string;
    status?: string;
    skip: number;
    limit: number;
  }): Promise<{ items: FiatDeposit[]; total: number }>;
  transaction<R>(fn: (manager: EntityManager) => Promise<R>): Promise<R>;
}
