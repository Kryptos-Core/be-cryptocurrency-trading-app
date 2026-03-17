import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '@/entities/user.entity';
import { AuthRepository } from './repositories';
import { CacheService } from '@/common/services';
import { BlockchainProviderFactory } from '@/modules/blockchain/blockchain-provider.factory';
import { BadRequestException, BusinessException } from '@/common/exceptions';
import { BlockchainNetwork } from '@/common/enums';
import { Permission, UserRole } from '@/common/enums';
import { getPermissionsForRole } from '@/common/authz/rbac-policy';
import { newUuid } from '@/common/utils/uuid.util';

/** Response for wallet auth (login or register) */
export interface WalletAuthResult {
  accessToken: string;
  user: Partial<User>;
  isNewUser: boolean;
}

/**
 * Wallet Auth Service
 * Xử lý đăng nhập/đăng ký bằng ví (MetaMask, TronLink) — challenge-response với nonce trong Redis
 */
@Injectable()
export class WalletAuthService {
  private readonly logger = new Logger(WalletAuthService.name);

  private static readonly NONCE_TTL = 300; // 5 phút
  private static readonly AUTH_NONCE_PREFIX = 'wallet:auth:nonce:';

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly cacheService: CacheService,
    private readonly providerFactory: BlockchainProviderFactory,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Bước 1: Tạo nonce challenge cho wallet auth (chưa đăng nhập)
   */
  async requestNonce(chain: BlockchainNetwork, address: string): Promise<{ message: string; expiresIn: number }> {
    const provider = this.providerFactory.getProvider(chain);

    if (!provider.isValidAddress(address)) {
      throw new BadRequestException(
        `Địa chỉ ví không hợp lệ trên mạng ${chain}`,
        'INVALID_ADDRESS',
      );
    }

    const nonce = newUuid();
    const message = `Crypto Trading Platform - Xác thực đăng nhập\n\nNonce: ${nonce}\nChain: ${chain}\nAddress: ${address}\n\nKý message này để xác minh quyền sở hữu ví.`;

    const cacheKey = this.nonceKey(chain, address);
    await this.cacheService.set(
      cacheKey,
      { nonce, message },
      WalletAuthService.NONCE_TTL,
    );

    this.logger.debug(`[WalletAuth] Nonce requested: chain=${chain}, address=${address}`);

    return {
      message,
      expiresIn: WalletAuthService.NONCE_TTL,
    };
  }

  /**
   * Bước 2: Xác minh chữ ký và đăng nhập hoặc đăng ký
   */
  async verifyAndAuthenticate(
    chain: BlockchainNetwork,
    address: string,
    signature: string,
  ): Promise<WalletAuthResult> {
    const provider = this.providerFactory.getProvider(chain);

    const cacheKey = this.nonceKey(chain, address);
    const cached = await this.cacheService.get<{ nonce: string; message: string }>(cacheKey);

    if (!cached) {
      throw new BadRequestException(
        'Nonce đã hết hạn hoặc không tồn tại. Vui lòng yêu cầu đăng nhập lại.',
        'NONCE_EXPIRED',
      );
    }

    const isValid = await provider.verifySignature(address, cached.message, signature);
    if (!isValid) {
      throw new BadRequestException(
        'Chữ ký không hợp lệ. Vui lòng ký lại bằng ví đúng.',
        'INVALID_SIGNATURE',
      );
    }

    await this.cacheService.delete(cacheKey);

    let user = await this.authRepository.findByLinkedWallet(chain, address);

    if (user) {
      if (user.status === 'BANNED') {
        throw new BusinessException('Tài khoản đã bị khoá', 'ACCOUNT_BANNED');
      }
      this.logger.log(`[WalletAuth] Login: userId=${user.user_id}, chain=${chain}`);
      const accessToken = this.buildAccessToken(user);
      return {
        accessToken,
        user: this.sanitizeUser(user),
        isNewUser: false,
      };
    }

    const placeholderEmail = this.placeholderEmail(address, chain);
    const passwordHash = await bcrypt.hash(newUuid(), 10);
    const userId = newUuid();

    user = await this.authRepository.createWalletOnlyUser(
      userId,
      placeholderEmail,
      passwordHash,
      chain,
      address,
    );

    this.logger.log(`[WalletAuth] Register: userId=${userId}, chain=${chain}, address=${address}`);
    const accessToken = this.buildAccessToken(user);
    return {
      accessToken,
      user: this.sanitizeUser(user),
      isNewUser: true,
    };
  }

  private nonceKey(chain: BlockchainNetwork, address: string): string {
    return `${WalletAuthService.AUTH_NONCE_PREFIX}${chain}:${address}`;
  }

  private placeholderEmail(address: string, chain: BlockchainNetwork): string {
    const short = address.replace(/^0x/i, '').slice(0, 8);
    const chainSlug = String(chain).toLowerCase();
    return `${short}@${chainSlug}.wallet`;
  }

  private buildAccessToken(user: User): string {
    const isValidRole = (Object.values(UserRole) as string[]).includes(user.role as string);
    const role = isValidRole ? (user.role as UserRole) : UserRole.TRADER;
    const permissions = getPermissionsForRole(role) as Permission[];

    const payload = {
      userId: user.user_id,
      email: user.email,
      role,
      permissions,
      sub: user.user_id,
    };

    return this.jwtService.sign(payload);
  }

  private sanitizeUser(user: User): Partial<User> {
    const { password_hash, two_fa_secret, ...sanitized } = user;
    return sanitized;
  }
}
