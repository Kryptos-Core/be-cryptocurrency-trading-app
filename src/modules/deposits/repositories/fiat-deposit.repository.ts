import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { FiatDeposit } from '@/entities/fiat-deposit.entity';

@Injectable()
export class FiatDepositRepository extends BaseRepository<FiatDeposit> {
  constructor(dataSource: DataSource) {
    super(FiatDeposit, dataSource);
  }

  async createDeposit(
    depositId: string,
    userId: string,
    amount: string,
    orderCode: number,
    checkoutUrl: string,
    manager?: EntityManager,
  ): Promise<FiatDeposit> {
    const result = await (manager ?? this.dataSource).query(
      'CALL sp_fiat_deposit_create(?, ?, ?, ?, ?)',
      [depositId, userId, amount, orderCode, checkoutUrl],
    );
    const row = result?.[0]?.[0];
    if (!row) throw new Error('Failed to create fiat deposit');
    return this.mapRow(row);
  }

  async updateStatus(
    orderCode: number,
    status: 'PENDING' | 'PAID' | 'CANCELLED',
    manager?: EntityManager,
  ): Promise<FiatDeposit> {
    const result = await (manager ?? this.dataSource).query(
      'CALL sp_fiat_deposit_update_status(?, ?)',
      [orderCode, status],
    );
    const row = result?.[0]?.[0];
    if (!row) throw new Error('Failed to update fiat deposit status or not found');
    return this.mapRow(row);
  }

  async findByOrderCode(orderCode: number): Promise<FiatDeposit | null> {
    const result = await this.dataSource.query(
      'CALL sp_fiat_deposit_find_by_order_code(?)',
      [orderCode],
    );
    const row = result?.[0]?.[0];
    if (!row) return null;
    return this.mapRow(row);
  }

  async findByUser(userId: string): Promise<FiatDeposit[]> {
    const rows = await this.dataSource.query(
      'CALL sp_fiat_deposit_find_by_user(?)',
      [userId],
    );
    return (rows?.[0] || []).map(this.mapRow);
  }

  private mapRow(row: any): FiatDeposit {
    const deposit = new FiatDeposit();
    deposit.deposit_id = row.deposit_id;
    deposit.user_id = row.user_id;
    deposit.amount = row.amount;
    deposit.status = row.status;
    deposit.order_code = Number(row.order_code);
    deposit.checkout_url = row.checkout_url;
    deposit.created_at = row.created_at;
    deposit.updated_at = row.updated_at;
    return deposit;
  }
}
