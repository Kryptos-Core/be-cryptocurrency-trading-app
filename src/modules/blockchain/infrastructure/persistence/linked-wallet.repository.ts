import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LinkedWallet } from '@/modules/blockchain';
import type { LinkedWalletRepositoryPort } from '@/modules/blockchain/domain/ports';

/**
 * Infrastructure: Linked Wallet Repository (TypeORM + raw SQL)
 * Implements LinkedWalletRepositoryPort — contains all persistence logic
 * for linked_wallets table that was previously scattered across services.
 */
@Injectable()
export class LinkedWalletRepository implements LinkedWalletRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  private static normalizeLookupAddress(address: string): string {
    return address.trim();
  }

  private static isEvmStyleAddress(address: string): boolean {
    const normalized = address.trim();
    return normalized.startsWith('0x') || normalized.startsWith('0X');
  }

  async findByUserAndChain(userId: string, chain: string): Promise<LinkedWallet | null> {
    return this.dataSource.getRepository(LinkedWallet).findOne({
      where: { user_id: userId, chain },
    });
  }

  async findByAddress(chain: string, address: string): Promise<LinkedWallet | null> {
    const normalized = LinkedWalletRepository.normalizeLookupAddress(address);
    if (LinkedWalletRepository.isEvmStyleAddress(normalized)) {
      return this.dataSource
        .getRepository(LinkedWallet)
        .createQueryBuilder('w')
        .where('w.chain = :chain AND LOWER(w.address) = LOWER(:address)', {
          chain,
          address: normalized,
        })
        .getOne();
    }

    return this.dataSource.getRepository(LinkedWallet).findOne({
      where: { chain, address: normalized },
    });
  }

  async findByUser(userId: string): Promise<LinkedWallet[]> {
    return this.dataSource.getRepository(LinkedWallet).find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async findActiveByUser(userId: string): Promise<
    Array<{
      link_id: string;
      chain: string;
      address: string;
      label: string | null;
      status: string;
      linked_at: Date | null;
    }>
  > {
    const rows = await this.dataSource.query(
      `SELECT link_id, chain, address, label, status, linked_at
       FROM linked_wallets
       WHERE user_id = $1 AND status != 'REVOKED'
       ORDER BY created_at DESC`,
      [userId],
    );

    return (rows || []).map((r: Record<string, unknown>) => ({
      link_id: r.link_id,
      chain: r.chain,
      address: r.address,
      label: r.label ?? null,
      status: r.status,
      linked_at:
        r.linked_at instanceof Date
          ? r.linked_at
          : typeof r.linked_at === 'string' || typeof r.linked_at === 'number'
            ? new Date(r.linked_at)
            : null,
    }));
  }

  async findVerifiedByUserChainAddress(
    userId: string,
    chain: string,
    address: string,
  ): Promise<LinkedWallet | null> {
    const normalized = LinkedWalletRepository.normalizeLookupAddress(address);
    if (LinkedWalletRepository.isEvmStyleAddress(normalized)) {
      return this.dataSource
        .getRepository(LinkedWallet)
        .createQueryBuilder('w')
        .where('w.user_id = :userId AND w.chain = :chain AND LOWER(w.address) = LOWER(:address)', {
          userId,
          chain,
          address: normalized,
        })
        .andWhere('w.status = :status', { status: 'VERIFIED' })
        .getOne();
    }

    return this.dataSource.getRepository(LinkedWallet).findOne({
      where: { user_id: userId, chain, address: normalized, status: 'VERIFIED' },
    });
  }

  async findVerifiedByChainAndAddress(
    chain: string,
    address: string,
  ): Promise<LinkedWallet | null> {
    const normalized = LinkedWalletRepository.normalizeLookupAddress(address);
    const repo = this.dataSource.getRepository(LinkedWallet).createQueryBuilder('w');
    const query = LinkedWalletRepository.isEvmStyleAddress(normalized)
      ? repo.where('w.chain = :chain AND LOWER(w.address) = LOWER(:address) AND w.status = :st', {
          chain,
          address: normalized,
          st: 'VERIFIED',
        })
      : repo.where('w.chain = :chain AND w.address = :address AND w.status = :st', {
          chain,
          address: normalized,
          st: 'VERIFIED',
        });

    return query.orderBy('w.linked_at', 'ASC').addOrderBy('w.created_at', 'ASC').getOne();
  }

  async findByLinkIdAndUserId(linkId: string, userId: string): Promise<LinkedWallet | null> {
    return this.dataSource.getRepository(LinkedWallet).findOne({
      where: { link_id: linkId, user_id: userId },
    });
  }

  async create(data: Partial<LinkedWallet>): Promise<LinkedWallet> {
    const repo = this.dataSource.getRepository(LinkedWallet);
    return repo.save(repo.create(data));
  }

  async updateStatus(linkId: string, status: string): Promise<void> {
    await this.dataSource
      .getRepository(LinkedWallet)
      .update({ link_id: linkId }, { status: status as LinkedWallet['status'] });
  }

  /**
   * Upsert ví VERIFIED bằng PostgreSQL ON CONFLICT.
   * Trả về link_id thực tế được giữ trong DB.
   */
  async upsertVerified(params: {
    linkId: string;
    userId: string;
    chain: string;
    address: string;
    label: string | null;
    now: Date;
  }): Promise<string> {
    const { linkId, userId, chain, address, label, now } = params;
    const rows = await this.dataSource.query(
      `INSERT INTO linked_wallets (link_id, user_id, chain, address, label, status, linked_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'VERIFIED', $6, $7)
       ON CONFLICT (user_id, chain, address)
       DO UPDATE
         SET status = 'VERIFIED',
             linked_at = EXCLUDED.linked_at,
             label = COALESCE(EXCLUDED.label, linked_wallets.label)
       RETURNING link_id`,
      [linkId, userId, chain, address, label, now, now],
    );

    return rows?.[0]?.link_id ?? linkId;
  }

  async findVerifiedByChain(chain: string): Promise<
    Array<{
      link_id: string;
      user_id: string;
      chain: string;
      address: string;
      label: string | null;
      status: string;
      linked_at: Date | null;
    }>
  > {
    const rows = await this.dataSource.query(
      `SELECT link_id, user_id, chain, address, label, status, linked_at
         FROM linked_wallets
        WHERE chain = $1 AND status = 'VERIFIED'
        ORDER BY linked_at DESC NULLS LAST, created_at DESC`,
      [chain],
    );

    return (rows || []).map((r: Record<string, unknown>) => ({
      link_id: r.link_id,
      user_id: r.user_id,
      chain: r.chain,
      address: r.address,
      label: r.label ?? null,
      status: r.status,
      linked_at:
        r.linked_at instanceof Date
          ? r.linked_at
          : typeof r.linked_at === 'string' || typeof r.linked_at === 'number'
            ? new Date(r.linked_at)
            : null,
    }));
  }

  async revokeByLinkIdAndUserId(linkId: string, userId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `UPDATE linked_wallets
       SET status = 'REVOKED'
       WHERE link_id = $1 AND user_id = $2 AND status = 'VERIFIED'
       RETURNING link_id`,
      [linkId, userId],
    );

    return Array.isArray(rows) ? rows.length : 0;
  }
}
