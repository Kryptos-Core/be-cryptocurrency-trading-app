import { Injectable } from '@nestjs/common';
import type { FiatDeposit } from '@/entities/fiat-deposit.entity';
import { DepositsService } from '../../deposits.service';

export interface GetDepositsForAdminParams {
  userId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * GetDepositsQuery — read-only queries for deposit data.
 *
 * Separates reads from writes following CQS principle.
 * Delegates to DepositsService until Phase 4.2 decomposition.
 */
@Injectable()
export class GetDepositsQuery {
  constructor(private readonly depositsService: DepositsService) {}

  /** Get deposits for the calling user. */
  async getMyDeposits(userId: string): Promise<FiatDeposit[]> {
    return this.depositsService.getMyDeposits(userId);
  }

  /** Get all deposits for admin dashboard (paginated + filterable). */
  async getAllForAdmin(params: GetDepositsForAdminParams): Promise<{
    items: FiatDeposit[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, ...rest } = params;
    const result = await this.depositsService.getAllDepositsForAdmin({ ...rest, page, limit });
    return { items: result.data, total: result.total, page, limit };
  }
}
