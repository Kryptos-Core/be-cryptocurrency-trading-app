import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { uuidv7 } from 'uuidv7';
import { CacheService } from '@/common/services';
import { BadRequestException } from '@/common/exceptions';
import { BlockchainNetwork } from '@/common/enums';
import { WcSessionStatus } from '@/modules/blockchain/wallet-connect/dto';
import { WalletAuthService, WalletAuthResult } from './wallet-auth.service';

/**
 * Public WalletConnect login session (no JWT để init).
 * Redis key: wc:auth:session:{sessionId}
 *
 * Flow: POST init → FE hiển thị QR / deep link → user ký đúng `message` của session
 * → POST verify với sessionId + address + signature → JWT như /auth/wallet-verify.
 */
export interface WcAuthSessionData {
  sessionId: string;
  chain: BlockchainNetwork;
  wcUri: string;
  nonce: string;
  message: string;
  status: WcSessionStatus;
  address?: string;
  signature?: string;
  createdAt: number;
}

@Injectable()
export class WalletConnectAuthService implements OnModuleInit {
  private readonly logger = new Logger(WalletConnectAuthService.name);

  private static readonly SESSION_TTL = 300;
  private static readonly AUTH_SESSION_PREFIX = 'wc:auth:session:';

  private static readonly EVM_CHAINS: BlockchainNetwork[] = [
    BlockchainNetwork.ETH_SEPOLIA,
    BlockchainNetwork.SOLANA_DEVNET,
  ];

  private static readonly CHAIN_CAIP: Record<string, string> = {
    [BlockchainNetwork.ETH_SEPOLIA]: 'eip155:11155111',
    [BlockchainNetwork.SOLANA_DEVNET]: 'solana:EtWTRAqHX4t7hs',
  };

  private projectId!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly walletAuthService: WalletAuthService,
  ) {}

  onModuleInit() {
    this.projectId = this.configService.get<string>('WALLETCONNECT_PROJECT_ID', '');
    if (!this.projectId) {
      this.logger.warn('[WC-Auth] WALLETCONNECT_PROJECT_ID chưa cấu hình — wcUri có thể không hoạt động với relay.');
    }
  }

  async initSession(chain: BlockchainNetwork): Promise<{
    sessionId: string;
    wcUri: string;
    message: string;
    expiresIn: number;
    caip2Chain: string;
  }> {
    this.assertWcChain(chain);

    const sessionId = uuidv7();
    const nonce = uuidv7();
    const message = this.buildAuthSigningMessage(nonce, chain);
    const caip2 = WalletConnectAuthService.CHAIN_CAIP[chain];
    const wcUri = this.buildWcUri(sessionId, caip2);

    const sessionData: WcAuthSessionData = {
      sessionId,
      chain,
      wcUri,
      nonce,
      message,
      status: WcSessionStatus.PENDING,
      createdAt: Date.now(),
    };

    await this.saveSession(sessionId, sessionData);

    this.logger.debug(`[WC-Auth] init: sessionId=${sessionId}, chain=${chain}`);

    return {
      sessionId,
      wcUri,
      message,
      expiresIn: WalletConnectAuthService.SESSION_TTL,
      caip2Chain: caip2,
    };
  }

  async getSessionStatus(sessionId: string): Promise<{
    sessionId: string;
    status: WcSessionStatus;
    address?: string;
    expiresAt?: number;
    message?: string;
    wcUri?: string;
  }> {
    const session = await this.loadSession(sessionId);

    if (!session) {
      return { sessionId, status: WcSessionStatus.EXPIRED };
    }

    const expiresAt = session.createdAt + WalletConnectAuthService.SESSION_TTL * 1000;

    if (Date.now() > expiresAt) {
      await this.deleteSession(sessionId);
      return { sessionId, status: WcSessionStatus.EXPIRED };
    }

    return {
      sessionId,
      status: session.status,
      address: session.address,
      expiresAt,
      message: session.message,
      wcUri: session.wcUri,
    };
  }

  async verifySession(
    sessionId: string,
    chain: BlockchainNetwork,
    address: string,
    signature: string,
  ): Promise<WalletAuthResult> {
    const session = await this.loadSession(sessionId);

    if (!session) {
      throw new BadRequestException(
        'Session WalletConnect đăng nhập đã hết hạn hoặc không tồn tại',
        'WC_AUTH_SESSION_EXPIRED',
      );
    }

    const expiresAt = session.createdAt + WalletConnectAuthService.SESSION_TTL * 1000;
    if (Date.now() > expiresAt) {
      await this.deleteSession(sessionId);
      throw new BadRequestException(
        'Session WalletConnect đăng nhập đã hết hạn hoặc không tồn tại',
        'WC_AUTH_SESSION_EXPIRED',
      );
    }

    if (session.chain !== chain) {
      throw new BadRequestException(
        `Chain không khớp session: mong đợi ${session.chain}`,
        'WC_AUTH_CHAIN_MISMATCH',
      );
    }

    const result = await this.walletAuthService.verifyAndAuthenticateWithMessage(
      chain,
      address,
      signature,
      session.message,
    );

    await this.deleteSession(sessionId);
    this.logger.log(`[WC-Auth] verify OK: sessionId=${sessionId}, chain=${chain}, address=${address}`);

    return result;
  }

  private assertWcChain(chain: BlockchainNetwork): void {
    if (!WalletConnectAuthService.EVM_CHAINS.includes(chain)) {
      throw new BadRequestException(
        `Chain "${chain}" không được hỗ trợ cho WalletConnect đăng nhập công khai`,
        'WC_AUTH_CHAIN_NOT_SUPPORTED',
      );
    }
  }

  private buildAuthSigningMessage(nonce: string, chain: BlockchainNetwork): string {
    return `Crypto Trading Platform - Đăng nhập WalletConnect\n\nNonce: ${nonce}\nChain: ${chain}\n\nKý message này để xác minh quyền sở hữu ví.`;
  }

  private buildWcUri(sessionId: string, _caip2Chain: string): string {
    const topic = createHash('sha256')
      .update(`${sessionId}:${Date.now()}:${this.projectId || 'no-project'}`)
      .digest('hex');

    const symKey = createHash('sha256')
      .update(`${sessionId}:symkey:${this.projectId || 'no-project'}`)
      .digest('hex');

    const params = new URLSearchParams();
    params.set('relay-protocol', 'irn');
    params.set('symKey', symKey);
    params.set('expiryTimestamp', String(Math.floor(Date.now() / 1000) + 300));

    const base = `wc:${topic}@2?${params.toString()}`;
    return this.projectId ? `${base}&projectId=${this.projectId}` : base;
  }

  private sessionKey(sessionId: string): string {
    return `${WalletConnectAuthService.AUTH_SESSION_PREFIX}${sessionId}`;
  }

  private async saveSession(sessionId: string, data: WcAuthSessionData): Promise<void> {
    await this.cacheService.set(
      this.sessionKey(sessionId),
      data,
      WalletConnectAuthService.SESSION_TTL,
    );
  }

  private async loadSession(sessionId: string): Promise<WcAuthSessionData | null> {
    return this.cacheService.get<WcAuthSessionData>(this.sessionKey(sessionId));
  }

  private async deleteSession(sessionId: string): Promise<void> {
    await this.cacheService.delete(this.sessionKey(sessionId));
  }
}
