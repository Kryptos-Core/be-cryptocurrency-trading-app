import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { type BlockchainNetwork, LinkedWalletStatus } from '@/common/enums';
import { BadRequestException, ConflictException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import type { RequestLinkDto, VerifyLinkDto } from './dto';

/**
 * Wallet Linking Service
 * Xử lý flow liên kết ví on-chain (challenge-response)
 * - SRP: Chỉ xử lý logic liên kết/huỷ liên kết
 * - DIP: Phụ thuộc interface IBlockchainProvider qua Factory
 */
@Injectable()
export class WalletLinkingService {
  private readonly logger = new Logger(WalletLinkingService.name);

  /** TTL nonce challenge (giây) */
  private static readonly NONCE_TTL = 300; // 5 phút
  /** TTL cache danh sách ví liên kết (giây) */
  private static readonly LINKED_CACHE_TTL = 600; // 10 phút
  /** Prefix bắt buộc cho test signature bypass */
  private static readonly TEST_SIGNATURE_PREFIX = 'TEST_SIG::';

  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly providerFactory: BlockchainProviderFactory,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  /**
   * Bước 1: Tạo nonce challenge cho wallet linking
   * FE sẽ yêu cầu user ký message này bằng ví
   */
  async requestLink(
    userId: string,
    dto: RequestLinkDto,
  ): Promise<{ message: string; expiresIn: number }> {
    const provider = this.providerFactory.getProvider(dto.chain);

    // Validate address
    if (!provider.isValidAddress(dto.address)) {
      throw new BadRequestException(
        `Địa chỉ ví không hợp lệ trên mạng ${dto.chain}`,
        'INVALID_ADDRESS',
      );
    }

    // Kiểm tra ví đã được liên kết chưa
    const existing = await this.findVerifiedWallet(userId, dto.chain, dto.address);
    if (existing) {
      throw new ConflictException(
        'Ví này đã được liên kết với tài khoản của bạn',
        'WALLET_ALREADY_LINKED',
      );
    }

    // Tạo nonce ngẫu nhiên
    const nonce = uuidv7();
    const message = `Crypto Trading Platform - Liên kết ví\n\nNonce: ${nonce}\nChain: ${dto.chain}\nAddress: ${dto.address}\n\nKý message này để xác minh quyền sở hữu ví.`;

    // Lưu nonce vào Redis (TTL 5 phút)
    const cacheKey = this.nonceKey(userId, dto.chain, dto.address);
    await this.cacheService.set(
      cacheKey,
      { nonce, message, label: dto.label ?? null },
      WalletLinkingService.NONCE_TTL,
    );

    this.logger.debug(`[RequestLink] userId=${userId}, chain=${dto.chain}, address=${dto.address}`);

    return {
      message,
      expiresIn: WalletLinkingService.NONCE_TTL,
    };
  }

  /**
   * Bước 2: Xác minh chữ ký và tạo liên kết ví
   */
  async verifyLink(
    userId: string,
    dto: VerifyLinkDto,
  ): Promise<{
    linkId: string;
    chain: string;
    address: string;
    status: string;
  }> {
    const provider = this.providerFactory.getProvider(dto.chain);

    // Lấy nonce từ Redis
    const cacheKey = this.nonceKey(userId, dto.chain, dto.address);
    const cached = await this.cacheService.get<{
      nonce: string;
      message: string;
      label: string | null;
    }>(cacheKey);

    if (!cached) {
      throw new BadRequestException(
        'Nonce đã hết hạn hoặc không tồn tại. Vui lòng yêu cầu liên kết lại.',
        'NONCE_EXPIRED',
      );
    }

    const isTestSignature = dto.signature.startsWith(WalletLinkingService.TEST_SIGNATURE_PREFIX);

    if (isTestSignature && !(await this.isTestSignatureBypassEnabled())) {
      throw new BadRequestException(
        'Test signature bypass đang tắt. Development: bật BLOCKCHAIN_ALLOW_TEST_SIGNATURE (env hoặc runtime). Staging: có thể bật qua runtime. Production: luôn tắt.',
        'TEST_SIGNATURE_BYPASS_DISABLED',
      );
    }

    let isValid = false;

    if (isTestSignature) {
      const payload = dto.signature.slice(WalletLinkingService.TEST_SIGNATURE_PREFIX.length).trim();

      if (!payload) {
        throw new BadRequestException(
          `Sai định dạng test signature. Yêu cầu prefix ${WalletLinkingService.TEST_SIGNATURE_PREFIX} kèm payload.`,
          'INVALID_TEST_SIGNATURE_FORMAT',
        );
      }

      isValid = true;
      this.logger.warn(
        `!!! SECURITY WARNING !!! [TEST_SIGNATURE_BYPASS_USED] userId=${userId}, chain=${dto.chain}, address=${dto.address}`,
      );
    } else {
      // Xác minh chữ ký bằng blockchain provider
      isValid = await provider.verifySignature(dto.address, cached.message, dto.signature);
    }

    if (!isValid) {
      throw new BadRequestException(
        'Chữ ký không hợp lệ. Vui lòng ký lại bằng ví đúng.',
        'INVALID_SIGNATURE',
      );
    }

    // Tạo linked wallet record
    const linkId = uuidv7();
    const now = new Date();

    await this.dataSource.query(
      `INSERT INTO linked_wallets (link_id, user_id, chain, address, label, status, linked_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'VERIFIED', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'VERIFIED', linked_at = ?, label = COALESCE(?, label)`,
      [linkId, userId, dto.chain, dto.address, cached.label, now, now, now, cached.label],
    );

    // Xoá nonce + invalidate cache danh sách ví
    await this.cacheService.delete(cacheKey);
    await this.invalidateLinkedCache(userId);

    this.logger.log(
      `[VerifyLink] Liên kết thành công: userId=${userId}, chain=${dto.chain}, address=${dto.address}`,
    );

    return {
      linkId,
      chain: dto.chain,
      address: dto.address,
      status: LinkedWalletStatus.VERIFIED,
    };
  }

  /**
   * Huỷ liên kết ví (soft delete → REVOKED)
   */
  async unlinkWallet(userId: string, linkId: string): Promise<{ linkId: string; status: string }> {
    const result = await this.dataSource.query(
      `UPDATE linked_wallets SET status = 'REVOKED' WHERE link_id = ? AND user_id = ? AND status = 'VERIFIED'`,
      [linkId, userId],
    );

    const affected = result?.affectedRows ?? result?.[0]?.affectedRows ?? 0;
    if (!affected) {
      throw new BadRequestException(
        'Ví liên kết không tìm thấy hoặc đã bị huỷ',
        'WALLET_NOT_FOUND',
      );
    }

    await this.invalidateLinkedCache(userId);

    this.logger.log(`[Unlink] userId=${userId}, linkId=${linkId}`);

    return { linkId, status: LinkedWalletStatus.REVOKED };
  }

  /**
   * Lấy danh sách ví đã liên kết (cache 10 phút)
   */
  async getLinkedWallets(userId: string): Promise<
    Array<{
      linkId: string;
      chain: string;
      address: string;
      label: string | null;
      status: string;
      linkedAt: string | null;
    }>
  > {
    const cacheKey = this.linkedCacheKey(userId);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.dataSource.query(
          `SELECT link_id, chain, address, label, status, linked_at
           FROM linked_wallets
           WHERE user_id = ? AND status != 'REVOKED'
           ORDER BY created_at DESC`,
          [userId],
        );

        return (rows || []).map((r: any) => ({
          linkId: r.link_id,
          chain: r.chain,
          address: r.address,
          label: r.label ?? null,
          status: r.status,
          linkedAt: r.linked_at ? new Date(r.linked_at).toISOString() : null,
        }));
      },
      WalletLinkingService.LINKED_CACHE_TTL,
    );
  }

  /**
   * Lấy số dư on-chain của ví liên kết
   */
  async getLinkedWalletBalance(userId: string, linkId: string) {
    const rows = await this.dataSource.query(
      `SELECT link_id, chain, address, status FROM linked_wallets WHERE link_id = ? AND user_id = ?`,
      [linkId, userId],
    );

    const wallet = rows?.[0];
    if (!wallet) {
      throw new BadRequestException('Ví liên kết không tìm thấy', 'WALLET_NOT_FOUND');
    }

    if (wallet.status !== 'VERIFIED') {
      throw new BadRequestException('Ví chưa được xác minh', 'WALLET_NOT_VERIFIED');
    }

    const provider = this.providerFactory.getProvider(wallet.chain as BlockchainNetwork);
    return provider.getBalance(wallet.address);
  }

  /** Tìm ví đã VERIFIED */
  async findVerifiedWallet(
    userId: string,
    chain: BlockchainNetwork,
    address: string,
  ): Promise<any | null> {
    const rows = await this.dataSource.query(
      `SELECT * FROM linked_wallets WHERE user_id = ? AND chain = ? AND address = ? AND status = 'VERIFIED' LIMIT 1`,
      [userId, chain, address],
    );
    return rows?.[0] ?? null;
  }

  /** Tìm ví theo linkId */
  async findByLinkId(userId: string, linkId: string): Promise<any | null> {
    const rows = await this.dataSource.query(
      `SELECT * FROM linked_wallets WHERE link_id = ? AND user_id = ? LIMIT 1`,
      [linkId, userId],
    );
    return rows?.[0] ?? null;
  }

  // ============ Redis Keys ============

  private nonceKey(userId: string, chain: BlockchainNetwork, address: string): string {
    return `wallet:link:nonce:${userId}:${chain}:${address}`;
  }

  private linkedCacheKey(userId: string): string {
    return `wallet:linked:${userId}`;
  }

  private async invalidateLinkedCache(userId: string): Promise<void> {
    await this.cacheService.delete(this.linkedCacheKey(userId));
  }

  private async isTestSignatureBypassEnabled(): Promise<boolean> {
    const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
    const envAllow = ['true', '1', 'yes', 'on'].includes(
      (process.env.BLOCKCHAIN_ALLOW_TEST_SIGNATURE || '').toLowerCase(),
    );
    const dbRaw = (
      await this.systemConfigService.getEffectiveString('BLOCKCHAIN_ALLOW_TEST_SIGNATURE')
    ).toLowerCase();
    const dbAllow = ['true', '1', 'yes', 'on'].includes(dbRaw);

    if (nodeEnv === 'production') {
      return false;
    }
    if (nodeEnv === 'development') {
      return envAllow || dbAllow;
    }
    return dbAllow || envAllow;
  }
}
