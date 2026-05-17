import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { getPermissionsForRole } from '@/common/authz/rbac-policy';
import { normalizeUserRole } from '@/common/authz/user-role.util';
import type { BlockchainNetwork, Permission } from '@/common/enums';
import { BadRequestException, BusinessException, ConflictException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import { newUuid } from '@/common/utils/uuid.util';
import { AUTH_REPOSITORY, type AuthRepositoryPort } from '@/modules/auth/domain/ports';
import { BlockchainProviderFactory } from '@/modules/blockchain/blockchain-provider.factory';
import { LINKED_WALLET_REPOSITORY, type LinkedWalletRepositoryPort } from '@/modules/blockchain/domain/ports';
import type { UserRecord } from '@/modules/users';
import { USERS_REPOSITORY, type UsersRepositoryPort } from '@/modules/users/domain/ports';

/** Response for wallet auth (login or register) */
export interface WalletAuthResult {
  accessToken: string;
  user: Partial<UserRecord>;
  isNewUser: boolean;
}

/**
 * Wallet Auth Service
 * Xử lý đăng nhập/đăng ký bằng ví (MetaMask, TronLink) — challenge-response với nonce trong Redis
 */
@Injectable()
export class WalletAuthService {
  private readonly logger = new Logger(WalletAuthService.name);

  private static readonly NONCE_TTL = 300; // 5 phut
  private static readonly AUTH_NONCE_PREFIX = 'wallet:auth:nonce:';

  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepositoryPort,
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    private readonly cacheService: CacheService,
    private readonly providerFactory: BlockchainProviderFactory,
    private readonly jwtService: JwtService,
    @Inject(LINKED_WALLET_REPOSITORY)
    private readonly linkedWalletRepo: LinkedWalletRepositoryPort,
  ) {}

  /**
   * Buoc 1: Tao nonce challenge cho wallet auth (chua dang nhap)
   */
  async requestNonce(
    chain: BlockchainNetwork,
    address: string,
  ): Promise<{ message: string; expiresIn: number }> {
    const provider = this.providerFactory.getProvider(chain);

    const isValid = provider.isValidAddress(address);
    this.logger.debug(
      `[WalletAuth] requestNonce: chain=${chain}, address="${address}" (len=${address?.length}), isValid=${isValid}`,
    );
    if (!isValid) {
      throw new BadRequestException(
        `Dia chi vi khong hop le tren mang ${chain}`,
        'INVALID_ADDRESS',
      );
    }

    const nonce = newUuid();
    const message = `Crypto Trading Platform - Xac thuc dang nhap\n\nNonce: ${nonce}\nChain: ${chain}\nAddress: ${address}\n\nKy message nay de xac minh quyen so huu vi.`;

    const cacheKey = this.nonceKey(chain, address);
    await this.cacheService.set(cacheKey, { nonce, message }, WalletAuthService.NONCE_TTL);

    this.logger.debug(`[WalletAuth] Nonce requested: chain=${chain}, address=${address}`);

    return {
      message,
      expiresIn: WalletAuthService.NONCE_TTL,
    };
  }

  /**
   * Buoc 2: Xac minh chu ky va dang nhap hoac dang ky
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
        'Nonce da het han hoac khong ton tai. Vui long yeu cau dang nhap lai.',
        'NONCE_EXPIRED',
      );
    }

    const isValid = await provider.verifySignature(address, cached.message, signature);
    if (!isValid) {
      throw new BadRequestException(
        'Chu ky khong hop le. Vui long ky lai bang vi dung.',
        'INVALID_SIGNATURE',
      );
    }

    await this.cacheService.delete(cacheKey);

    return this.finishWalletAuthentication(chain, address);
  }

  /**
   * Dang nhap/dang ky khi da co message + chu ky hop le (khong dung nonce Redis),
   * vi du flow WalletConnect public: message luu trong session wc:auth:*.
   */
  async verifyAndAuthenticateWithMessage(
    chain: BlockchainNetwork,
    address: string,
    signature: string,
    message: string,
  ): Promise<WalletAuthResult> {
    const provider = this.providerFactory.getProvider(chain);

    if (!provider.isValidAddress(address)) {
      throw new BadRequestException(
        `Dia chi vi khong hop le tren mang ${chain}`,
        'INVALID_ADDRESS',
      );
    }

    const isValid = await provider.verifySignature(address, message, signature);
    if (!isValid) {
      throw new BadRequestException(
        'Chu ky khong hop le. Vui long ky lai bang vi dung.',
        'INVALID_SIGNATURE',
      );
    }

    return this.finishWalletAuthentication(chain, address);
  }

  private async finishWalletAuthentication(
    chain: BlockchainNetwork,
    address: string,
  ): Promise<WalletAuthResult> {
    let user = await this.authRepository.findByLinkedWallet(chain, address);

    if (user) {
      if (user.status === 'BANNED') {
        throw new BusinessException('Tai khoan da bi khoa', 'ACCOUNT_BANNED');
      }
      const full = await this.usersRepository.findById(user.user_id);
      if (full) {
        user = full;
      }
      this.logger.log(`[WalletAuth] Login: userId=${user.user_id}, chain=${chain}`);
      const accessToken = this.buildAccessToken(user);
      return {
        accessToken,
        user: this.sanitizeUser(user),
        isNewUser: false,
      };
    }

    // CRITICAL: Check if this wallet is already linked to another user (global uniqueness).
    // This prevents the bug where User A and User B both link the same wallet address,
    // enabling double-withdrawal attacks.
    const globallyLinked = await this.linkedWalletRepo.findVerifiedByChainAndAddress(chain, address);
    if (globallyLinked) {
      this.logger.warn(
        `[WalletAuth] Duplicate wallet blocked: chain=${chain} address=${address} ` +
          `already linked to userId=${globallyLinked.user_id}`,
      );
      throw new ConflictException(
        'Dia chi vi nay da duoc lien ket voi tai khoan khac tren cung mang blockchain. ' +
          'Vui long su dung dia chi vi khac hoac lien he ho tro.',
        'WALLET_ALREADY_LINKED_BY_ANOTHER_USER',
      );
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

  private buildAccessToken(user: UserRecord): string {
    const role = normalizeUserRole(user.role as string);
    const permissions = getPermissionsForRole(role) as Permission[];
    const identityVerified = user.identity_verified === 1;
    const emailVerified = user.email_verified === 1;

    const payload = {
      userId: user.user_id,
      email: user.email,
      role,
      identityVerified,
      emailVerified,
      permissions,
      sub: user.user_id,
    };

    return this.jwtService.sign(payload);
  }

  private sanitizeUser(user: UserRecord): Partial<UserRecord> {
    const { password_hash, two_fa_secret, ...sanitized } = user;
    return sanitized;
  }
}
