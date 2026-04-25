import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { FiatDeposit } from '@/entities/fiat-deposit.entity';

type DepositRow = Record<string, unknown>;

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
    const rows = await (manager ?? this.dataSource).query(
      `INSERT INTO fiat_deposits (
         deposit_id, user_id, amount, status, order_code, checkout_url, created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'PENDING', $4, $5, NOW(), NOW()
       )
       RETURNING deposit_id, user_id, amount, status, order_code, checkout_url, created_at, updated_at`,
      [depositId, userId, amount, orderCode, checkoutUrl],
    );
    const row = rows?.[0];
    if (!row) throw new Error('Failed to create fiat deposit');
    return this.mapRow(row);
  }

  async updateStatus(
    orderCode: number,
    status: 'PENDING' | 'PAID' | 'CANCELLED',
    manager?: EntityManager,
  ): Promise<FiatDeposit> {
    const rows = await (manager ?? this.dataSource).query(
      `UPDATE fiat_deposits
       SET status = $2,
           updated_at = NOW()
       WHERE order_code = $1
       RETURNING deposit_id, user_id, amount, status, order_code, checkout_url, created_at, updated_at`,
      [orderCode, status],
    );
    const row = rows?.[0];
    if (!row) throw new Error('Failed to update fiat deposit status or not found');
    return this.mapRow(row);
  }

  async findByOrderCode(orderCode: number): Promise<FiatDeposit | null> {
    const rows = await this.dataSource.query(
      `SELECT deposit_id, user_id, amount, status, order_code, checkout_url, created_at, updated_at
       FROM fiat_deposits
       WHERE order_code = $1
       LIMIT 1`,
      [orderCode],
    );
    return rows?.[0] ? this.mapRow(rows[0]) : null;
  }

  async findByUser(userId: string): Promise<FiatDeposit[]> {
    const rows = await this.dataSource.query(
      `SELECT deposit_id, user_id, amount, status, order_code, checkout_url, created_at, updated_at
       FROM fiat_deposits
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return (rows ?? []).map((row: DepositRow) => this.mapRow(row));
  }

  async findAllForAdmin(params: {
    userId?: string;
    status?: string;
    skip: number;
    limit: number;
  }): Promise<{ items: FiatDeposit[]; total: number }> {
    const repo = this.dataSource.getRepository(FiatDeposit);
    const qb = repo.createQueryBuilder('d').orderBy('d.created_at', 'DESC');

    if (params.userId) qb.andWhere('d.user_id = :userId', { userId: params.userId });
    if (params.status) qb.andWhere('d.status = :status', { status: params.status });

    const [items, total] = await qb.skip(params.skip).take(params.limit).getManyAndCount();
    return { items, total };
  }

  private mapRow(row: DepositRow): FiatDeposit {
    const deposit = new FiatDeposit();
    deposit.deposit_id = String(row.deposit_id ?? '');
    deposit.user_id = String(row.user_id ?? '');
    deposit.amount = String(row.amount ?? '0');
    deposit.status = row.status as FiatDeposit['status'];
    deposit.order_code = Number(row.order_code ?? 0);
    deposit.checkout_url = row.checkout_url != null ? String(row.checkout_url) : null;
    deposit.created_at = row.created_at as Date;
    deposit.updated_at = row.updated_at as Date;
    return deposit;
  }
}
