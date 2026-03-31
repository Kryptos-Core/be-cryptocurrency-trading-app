import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type { SessionTypes } from '@walletconnect/types';
import { getAddressFromAccount, getChainFromAccount } from '@walletconnect/utils';
import { uuidv7 } from 'uuidv7';
import { CacheService } from '@/common/services';
import { BadRequestException } from '@/common/exceptions';
import { BlockchainNetwork } from '@/common/enums';
import { WcSessionStatus } from '@/modules/blockchain/wallet-connect/dto';
import { getWalletConnectDappClient } from '@/modules/blockchain/wallet-connect/walletconnect-dapp-client.factory';
import { WalletAuthService, WalletAuthResult } from './wallet-auth.service';
import type SignClient from '@walletconnect/sign-client';

/**
 * Public WalletConnect login session (no JWT để init).
 * Redis key: wc:auth:session:{sessionId}
 *
 * ETH_SEPOLIA + WALLETCONNECT_PROJECT_ID: URI thật từ @walletconnect/sign-client,
 * BE chờ approval + personal_sign, lưu address/signature vào Redis — FE poll rồi POST verify.
 *
 * Solana hoặc thiếu projectId: URI ghép (legacy) — user dán address + signature như trước.
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
    [BlockchainNetwork.SOLANA_DEVNET]: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  };

  /** Tránh POST /wc/init chờ connect() vô hạn khi relay treo. */
  private static readonly WC_CONNECT_TIMEOUT_MS = 15_000;

  private projectId!: string;
  private relayUrl!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly walletAuthService: WalletAuthService,
  ) {}

  onModuleInit() {
    this.projectId = this.resolveWalletConnectProjectId();
    this.relayUrl = this.configService.get<string>(
      'WALLETCONNECT_RELAY_URL',
      'wss://relay.walletconnect.com',
    );
    if (!this.projectId) {
      this.logger.warn(
        '[WC-Auth] Chưa có WALLETCONNECT_PROJECT_ID hoặc REOWN_PROJECT_ID — Sepolia dùng URI giả + dán tay (QR không nối relay).',
      );
    }
  }

  /** Cùng giá trị Reown Cloud; FE thường đặt một trong hai — BE đọc cả hai để tránh sót cấu hình. */
  private resolveWalletConnectProjectId(): string {
    const a = (this.configService.get<string>('WALLETCONNECT_PROJECT_ID', '') ?? '').trim();
    const b = (this.configService.get<string>('REOWN_PROJECT_ID', '') ?? '').trim();
    return a || b;
  }

  async initSession(chain: BlockchainNetwork): Promise<{
    sessionId: string;
    wcUri: string;
    message: string;
    expiresIn: number;
    caip2Chain: string;
    /** true khi BE dùng SignClient + relay thật (Sepolia + có project id). */
    relayPairing: boolean;
  }> {
    this.assertWcChain(chain);

    const sessionId = uuidv7();
    const nonce = uuidv7();
    const message = this.buildAuthSigningMessage(nonce, chain);
    const caip2 = WalletConnectAuthService.CHAIN_CAIP[chain];

    let wcUri: string;

    if (this.useRealWcPairing(chain)) {
      try {
        const client = await getWalletConnectDappClient({
          projectId: this.projectId,
          relayUrl: this.relayUrl,
        });
        const { uri, approval } = await client.connect({
          // SDK 2.23+: requiredNamespaces bị gộp sang optional — ví có thể approve Mainnet.
          // personal_sign là off-chain: dùng chainId đúng session (getChainFromAccount) để request hợp lệ.
          optionalNamespaces: {
            eip155: {
              chains: ['eip155:11155111'],
              methods: ['personal_sign', 'eth_sendTransaction'],
              events: [],
            },
          },
        });
        if (!uri) {
          throw new Error('WalletConnect connect() returned empty uri');
        }
        wcUri = uri;
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
        void this.runApprovalAndSign(sessionId, chain, message, approval, client).catch((e) =>
          this.logger.error(`[WC-Auth] background pairing error sessionId=${sessionId}`, e),
        );
      } catch (e) {
        this.logger.error('[WC-Auth] SignClient connect failed', e);
        const msg = WalletConnectAuthService.formatWcInitError(e);
        throw new BadRequestException(msg, 'WC_AUTH_INIT_FAILED');
      }
    } else {
      wcUri = this.buildSyntheticWcUri(sessionId);
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
    }

    const relayPairing = this.useRealWcPairing(chain);
    this.logger.debug(
      `[WC-Auth] init: sessionId=${sessionId}, chain=${chain}, relayPairing=${relayPairing}`,
    );

    return {
      sessionId,
      wcUri,
      message,
      expiresIn: WalletConnectAuthService.SESSION_TTL,
      caip2Chain: caip2,
      relayPairing,
    };
  }

  async getSessionStatus(sessionId: string): Promise<{
    sessionId: string;
    status: WcSessionStatus;
    address?: string;
    signature?: string;
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
      signature: session.signature,
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

  private useRealWcPairing(chain: BlockchainNetwork): boolean {
    return chain === BlockchainNetwork.ETH_SEPOLIA && Boolean(this.projectId);
  }

  private async runApprovalAndSign(
    sessionId: string,
    chain: BlockchainNetwork,
    message: string,
    approval: () => Promise<SessionTypes.Struct>,
    client: SignClient,
  ): Promise<void> {
    const loaded = await this.loadSession(sessionId);
    if (!loaded) return;

    const deadline = loaded.createdAt + WalletConnectAuthService.SESSION_TTL * 1000;
    const msLeftPairing = Math.max(5_000, deadline - Date.now());

    let wcSession: SessionTypes.Struct;
    try {
      wcSession = await this.withTimeout(approval(), msLeftPairing, 'WC_PAIRING_TIMEOUT');
    } catch (e) {
      this.logger.warn(`[WC-Auth] pairing failed sessionId=${sessionId}`, e);
      await this.patchSession(sessionId, { status: WcSessionStatus.FAILED });
      return;
    }

    const accounts = wcSession?.namespaces?.eip155?.accounts ?? [];
    const fullAccount = accounts[0];
    if (!fullAccount) {
      this.logger.warn(`[WC-Auth] no eip155 account sessionId=${sessionId}`);
      await this.patchSession(sessionId, { status: WcSessionStatus.FAILED });
      return;
    }

    const sessionChainId = getChainFromAccount(fullAccount);
    const expectedCaip2 = WalletConnectAuthService.CHAIN_CAIP[chain];
    if (sessionChainId !== expectedCaip2) {
      this.logger.debug(
        `[WC-Auth] WC session chain ${sessionChainId} (ký qua chain này); đăng nhập app vẫn ${chain} — message off-chain.`,
      );
    }

    const address = getAddressFromAccount(fullAccount);
    await this.patchSession(sessionId, { status: WcSessionStatus.CONNECTED, address });

    const chainId = sessionChainId;
    const hexMsg = `0x${Buffer.from(message, 'utf8').toString('hex')}`;

    const msLeftSign = Math.max(5_000, deadline - Date.now());

    let signature: string;
    try {
      const raw = await this.withTimeout(
        client.request({
          topic: wcSession.topic,
          chainId,
          request: {
            method: 'personal_sign',
            params: [hexMsg, address],
          },
        }),
        Math.min(msLeftSign, 120_000),
        'WC_SIGN_TIMEOUT',
      );
      signature = typeof raw === 'string' ? raw : String(raw);
    } catch (e) {
      this.logger.warn(`[WC-Auth] personal_sign failed sessionId=${sessionId}`, e);
      await this.patchSession(sessionId, { status: WcSessionStatus.FAILED, address });
      try {
        await client.disconnect({
          topic: wcSession.topic,
          reason: { code: 6000, message: 'Sign failed' },
        });
      } catch {
        /* ignore */
      }
      return;
    }

    await this.patchSession(sessionId, { status: WcSessionStatus.SIGNED, signature });

    try {
      await client.disconnect({
        topic: wcSession.topic,
        reason: { code: 6000, message: 'Authentication completed' },
      });
    } catch (dcErr) {
      this.logger.warn(`[WC-Auth] disconnect: ${dcErr}`);
    }
  }

  private static formatWcInitError(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    let msg = `Không khởi tạo WalletConnect: ${raw}`;
    const lower = raw.toLowerCase();
    if (
      lower.includes('jwt') ||
      lower.includes('not yet valid') ||
      lower.includes('iat') ||
      raw.includes('3000')
    ) {
      msg +=
        ' — Relay từ chối JWT (thường do đồng hồ máy chạy Nest lệch so với thời gian thực: bật đồng bộ thời gian tự động / NTP trên Windows hoặc máy ảo).';
    }
    return msg;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(label)), ms);
      promise.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
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

  /** URI không qua SignClient — chỉ dùng khi thiếu projectId hoặc chain không hỗ trợ pairing thật. */
  private buildSyntheticWcUri(sessionId: string): string {
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

  private async patchSession(sessionId: string, partial: Partial<WcAuthSessionData>): Promise<void> {
    const existing = await this.loadSession(sessionId);
    if (!existing) return;

    const expiresAt = existing.createdAt + WalletConnectAuthService.SESSION_TTL * 1000;
    const remainingSec = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));

    await this.cacheService.set(
      this.sessionKey(sessionId),
      { ...existing, ...partial },
      remainingSec,
    );
  }

  private async loadSession(sessionId: string): Promise<WcAuthSessionData | null> {
    return this.cacheService.get<WcAuthSessionData>(this.sessionKey(sessionId));
  }

  private async deleteSession(sessionId: string): Promise<void> {
    await this.cacheService.delete(this.sessionKey(sessionId));
  }
}
