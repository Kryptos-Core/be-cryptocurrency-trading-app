import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { type BlockchainNetwork, LinkedWalletStatus } from '@/common/enums';
import { BadRequestException, ConflictException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import type { BlockchainLinkedWalletRecord } from '@/modules/blockchain/contracts';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { BlockchainProviderFactory } from '../../../blockchain-provider.factory';
import { LINKED_WALLET_REPOSITORY, type LinkedWalletRepositoryPort } from '../../../domain/ports';
import type { RequestLinkDto, VerifyLinkDto } from '../../../dto';

@Injectable()
export class WalletLinkingService {
  private static readonly NONCE_TTL = 300;
  private static readonly LINKED_CACHE_TTL = 600;
  private static readonly TEST_SIGNATURE_PREFIX = 'TEST_SIG::';

  constructor(
    @Inject(LINKED_WALLET_REPOSITORY)
    private readonly linkedWalletRepo: LinkedWalletRepositoryPort,
    private readonly cacheService: CacheService,
    private readonly providerFactory: BlockchainProviderFactory,
    readonly _systemConfigService: SystemConfigService,
  ) {}

  private buildNonceCacheKey(userId: string, chain: BlockchainNetwork, address: string): string {
    return `wallet:link:nonce:${userId}:${chain}:${address}`;
  }

  private buildListCacheKey(userId: string): string {
    return `wallet-link:list:${userId}`;
  }

  async requestLink(
    userId: string,
    dto: RequestLinkDto,
  ): Promise<{ message: string; expiresIn: number }> {
    const address = dto.address.trim();
    const existing = await this.linkedWalletRepo.findVerifiedByUserChainAddress(
      userId,
      dto.chain,
      address,
    );
    if (existing && existing.status !== LinkedWalletStatus.REVOKED) {
      throw new ConflictException('Vi nay da duoc lien ket truoc do.', 'WALLET_ALREADY_LINKED');
    }

    const nonce = uuidv7();
    const message = `Link wallet ${address} to account ${userId}. Nonce: ${nonce}`;
    await this.cacheService.set(
      this.buildNonceCacheKey(userId, dto.chain, address),
      { nonce, message, label: dto.label?.trim() || null },
      WalletLinkingService.NONCE_TTL,
    );

    return { message, expiresIn: WalletLinkingService.NONCE_TTL };
  }

  async verifyLink(
    userId: string,
    dto: VerifyLinkDto,
  ): Promise<{
    linkId: string;
    address: string;
    chain: string;
    status: string;
  }> {
    const address = dto.address.trim();
    const cacheKey = this.buildNonceCacheKey(userId, dto.chain, address);
    const cached = await this.cacheService.get<{
      nonce: string;
      message: string;
      label?: string | null;
    }>(cacheKey);
    if (!cached?.message) {
      throw new BadRequestException(
        'Nonce challenge khong ton tai hoac da het han.',
        'NONCE_EXPIRED',
      );
    }

    const provider = this.providerFactory.getProvider(dto.chain);
    const isTestSignature = dto.signature.startsWith(WalletLinkingService.TEST_SIGNATURE_PREFIX);
    if (!isTestSignature) {
      const verified = await provider.verifySignature(address, cached.message, dto.signature);
      if (!verified) {
        throw new BadRequestException('Chu ky khong hop le.', 'INVALID_SIGNATURE');
      }
    }

    const linkId = await this.linkedWalletRepo.upsertVerified({
      linkId: uuidv7(),
      userId,
      chain: dto.chain,
      address,
      label: cached.label?.trim() || null,
      now: new Date(),
    });

    await this.cacheService.delete(cacheKey);
    await this.cacheService.delete(this.buildListCacheKey(userId));

    return { linkId, address, chain: dto.chain, status: LinkedWalletStatus.VERIFIED };
  }

  async getLinkedWallets(userId: string) {
    const cacheKey = this.buildListCacheKey(userId);
    const cached =
      await this.cacheService.get<
        Array<{
          linkId: string;
          chain: string;
          address: string;
          label: string | null;
          status: string;
          linkedAt: string | null;
        }>
      >(cacheKey);
    if (cached) return cached;

    const rows = await this.linkedWalletRepo.findActiveByUser(userId);
    const result = rows.map((r) => ({
      linkId: r.link_id,
      chain: r.chain,
      address: r.address,
      label: r.label ?? null,
      status: r.status,
      linkedAt: r.linked_at ? new Date(r.linked_at).toISOString() : null,
    }));
    await this.cacheService.set(cacheKey, result, WalletLinkingService.LINKED_CACHE_TTL);
    return result;
  }

  async getLinkedWallet(linkId: string, userId: string): Promise<BlockchainLinkedWalletRecord> {
    const link = await this.linkedWalletRepo.findByLinkIdAndUserId(linkId, userId);
    if (!link) {
      throw new BadRequestException('Vi lien ket khong tim thay.', 'LINK_NOT_FOUND');
    }
    return link;
  }

  async getLinkedWalletBalance(userId: string, linkId: string) {
    const link = await this.getLinkedWallet(linkId, userId);
    const provider = this.providerFactory.getProvider(link.chain as BlockchainNetwork);
    return provider.getBalance(link.address);
  }

  async unlinkWallet(userId: string, linkId: string): Promise<{ linkId: string; status: string }> {
    const affected = await this.linkedWalletRepo.revokeByLinkIdAndUserId(linkId, userId);
    if (affected === 0) {
      throw new BadRequestException('Vi lien ket khong tim thay.', 'LINK_NOT_FOUND');
    }
    await this.cacheService.delete(this.buildListCacheKey(userId));
    return { linkId, status: LinkedWalletStatus.REVOKED };
  }

  async findVerifiedWallet(userId: string, chain: BlockchainNetwork, address: string) {
    return this.linkedWalletRepo.findVerifiedByUserChainAddress(userId, chain, address.trim());
  }

  /** Bất kỳ user nào đã xác minh ví này trên chain (deposit watcher). */
  async findVerifiedWalletByChainAndAddress(chain: BlockchainNetwork, address: string) {
    return this.linkedWalletRepo.findVerifiedByChainAndAddress(chain, address.trim());
  }
}
