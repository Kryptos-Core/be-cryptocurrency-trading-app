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

  async findByUserAndChain(userId: string, chain: string): Promise<LinkedWallet | null> {
    return this.dataSource.getRepository(LinkedWallet).findOne({
      where: { user_id: userId, chain },
    });
  }

  async findByAddress(chain: string, address: string): Promise<LinkedWallet | null> {
    return this.dataSource.getRepository(LinkedWallet).findOne({
      where: { chain, address },
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
       WHERE user_id = ? AND status != 'REVOKED'
       ORDER BY created_at DESC`,
      [userId],
    );

    return (rows || []).map((r: any) => ({
      link_id: r.link_id,
      chain: r.chain,
      address: r.address,
      label: r.label ?? null,
      status: r.status,
      linked_at: r.linked_at ? new Date(r.linked_at) : null,
    }));
  }

  async findVerifiedByUserChainAddress(
    userId: string,
    chain: string,
    address: string,
  ): Promise<LinkedWallet | null> {
    return this.dataSource.getRepository(LinkedWallet).findOne({
      where: { user_id: userId, chain, address, status: 'VERIFIED' },
    });
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
   * Upsert ví VERIFIED: INSERT ... ON DUPLICATE KEY UPDATE.
   * Trả về linkId thực sự được lưu vào DB (có thể là id mới hoặc id cũ nếu dup).
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

    await this.dataSource.query(
      `INSERT INTO linked_wallets (link_id, user_id, chain, address, label, status, linked_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'VERIFIED', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'VERIFIED', linked_at = ?, label = COALESCE(?, label)`,
      [linkId, userId, chain, address, label, now, now, now, label],
    );

    // Nếu xảy ra DUPLICATE KEY UPDATE, id hiện tại là link_id đã tồn tại trước đó
    const existing = await this.dataSource.query(
      `SELECT link_id FROM linked_wallets WHERE user_id = ? AND chain = ? AND address = ? LIMIT 1`,
      [userId, chain, address],
    );

    return existing?.[0]?.link_id ?? linkId;
  }

  async revokeByLinkIdAndUserId(linkId: string, userId: string): Promise<number> {
    const result = await this.dataSource.query(
      `UPDATE linked_wallets SET status = 'REVOKED' WHERE link_id = ? AND user_id = ? AND status = 'VERIFIED'`,
      [linkId, userId],
    );

    return result?.affectedRows ?? result?.[0]?.affectedRows ?? 0;
  }
}
