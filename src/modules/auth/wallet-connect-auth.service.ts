import { createHash } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WalletConnectSignClient } from '@walletconnect/sign-client';
import { getAddressFromAccount, getChainFromAccount } from '@walletconnect/utils';
import bs58 from 'bs58';
import { uuidv7 } from 'uuidv7';
import { BlockchainNetwork } from '@/common/enums';
import { BadRequestException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import { WcSessionStatus } from '@/modules/blockchain/wallet-connect/dto';
import { withWalletConnectSignClientLock } from '@/modules/blockchain/wallet-connect/wallet-connect-sign-client-gate';
import {
  WC_RELAY_PAIRING_CHAINS,
  wcCaip2ForChain,
} from '@/modules/blockchain/wallet-connect/wc-caip.util';
import type { WcApprovedSession, WcConnectPairingResult } from '@/types/walletconnect-session';
import type { WalletAuthResult } from './wallet-auth.service';
import { WalletAuthService } from './wallet-auth.service';
import {
  formatWalletConnectInitError,
  parseSolanaCaip10Account,
  resolveWalletConnectProjectId,
  solanaWcResultToBackendSignature,
  withWalletConnectTimeout,
} from '@/modules/blockchain/wallet-connect/wallet-connect-common.util';

/**
 * Public WalletConnect login session (no JWT để init).
 * Redis key: wc:auth:session:{sessionId}
 *
 * ETH_MAINNET / BSC_MAINNET / SOLANA_MAINNET + project id: URI thật từ SignClient + relay;
 * BE chờ approval rồi `personal_sign` (EVM) hoặc `solana_signMessage` (Solana), FE poll rồi POST verify.
 *
 * Thiếu projectId: URI ghép (legacy) — user dán address + signature.
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
    this.projectId = resolveWalletConnectProjectId(this.configService);
    this.relayUrl = this.configService.get<string>(
      'WALLETCONNECT_RELAY_URL',
      'wss://relay.walletconnect.com',
    );
    if (!this.projectId) {
      this.logger.warn(
        '[WC-Auth] Chưa có WALLETCONNECT_PROJECT_ID hoặc REOWN_PROJECT_ID — mainnet dùng URI giả + dán tay (QR không nối relay).',
      );
    }
  }

  async initSession(chain: BlockchainNetwork): Promise<{
    sessionId: string;
    wcUri: string;
    message: string;
    expiresIn: number;
    caip2Chain: string;
    /** true khi BE dùng SignClient + relay thật (mainnet + có project id). */
    relayPairing: boolean;
  }> {
    this.assertWcChain(chain);

    const sessionId = uuidv7();
    const nonce = uuidv7();
    const message = this.buildAuthSigningMessage(nonce, chain);
    const caip2 = wcCaip2ForChain(chain);

    let wcUri: string;

    if (this.useRealWcPairing(chain)) {
      try {
        const { wcUri: pairedUri } = await new Promise<{ wcUri: string }>(
          (resolveHttp, rejectHttp) => {
            void withWalletConnectSignClientLock(
              { projectId: this.projectId, relayUrl: this.relayUrl },
              async (client) => {
                try {
                  const connectPromise = WalletConnectAuthService.isSolanaWcChain(chain)
                    ? client.connect({
                        optionalNamespaces: {
                          solana: {
                            chains: [wcCaip2ForChain(chain)],
                            methods: ['solana_signMessage', 'solana_signTransaction'],
                            events: [],
                          },
                        },
                      })
                    : client.connect({
                        optionalNamespaces: {
                          eip155: {
                            chains: [wcCaip2ForChain(chain)],
                            methods: ['personal_sign', 'eth_sendTransaction'],
                            events: [],
                          },
                        },
                      });
                  const { uri, approval } = await withWalletConnectTimeout(
                    connectPromise as Promise<WcConnectPairingResult>,
                    WalletConnectAuthService.WC_CONNECT_TIMEOUT_MS,
                    'WC_INIT_CONNECT_TIMEOUT',
                  );
                  if (!uri) {
                    throw new Error('WalletConnect connect() returned empty uri');
                  }
                  const sessionData: WcAuthSessionData = {
                    sessionId,
                    chain,
                    wcUri: uri,
                    nonce,
                    message,
                    status: WcSessionStatus.PENDING,
                    createdAt: Date.now(),
                  };
                  await this.saveSession(sessionId, sessionData);
                  resolveHttp({ wcUri: uri });
                  void this.runApprovalAndSign(sessionId, chain, message, approval, client).catch(
                    (e) => {
                      this.logger.error(
                        `[WC-Auth] background pairing error sessionId=${sessionId}`,
                        e,
                      );
                    },
                  );
                } catch (e) {
                  rejectHttp(e);
                  throw e;
                }
              },
            ).catch(rejectHttp);
          },
        );
        wcUri = pairedUri;
      } catch (e) {
        this.logger.error('[WC-Auth] SignClient connect failed', e);
        const msg = formatWalletConnectInitError(e);
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
    this.logger.log(
      `[WC-Auth] verify OK: sessionId=${sessionId}, chain=${chain}, address=${address}`,
    );

    return result;
  }

  private useRealWcPairing(chain: BlockchainNetwork): boolean {
    return WC_RELAY_PAIRING_CHAINS.includes(chain) && Boolean(this.projectId);
  }

  private async runApprovalAndSign(
    sessionId: string,
    chain: BlockchainNetwork,
    message: string,
    approval: () => Promise<WcApprovedSession>,
    client: WalletConnectSignClient,
  ): Promise<void> {
    const loaded = await this.loadSession(sessionId);
    if (!loaded) return;

    const deadline = loaded.createdAt + WalletConnectAuthService.SESSION_TTL * 1000;
    const msLeftPairing = Math.max(5_000, deadline - Date.now());

    let wcSession: WcApprovedSession;
    try {
      wcSession = await withWalletConnectTimeout(approval(), msLeftPairing, 'WC_PAIRING_TIMEOUT');
    } catch (e) {
      this.logger.warn(`[WC-Auth] pairing failed sessionId=${sessionId}`, e);
      await this.patchSession(sessionId, { status: WcSessionStatus.FAILED });
      return;
    }

    const expectedCaip2 = wcCaip2ForChain(chain);
    let address: string;
    let signature: string;

    if (WalletConnectAuthService.isSolanaWcChain(chain)) {
      const solAccounts = wcSession?.namespaces?.solana?.accounts ?? [];
      const fullSol = solAccounts[0];
      if (!fullSol) {
        this.logger.warn(`[WC-Auth] no solana account sessionId=${sessionId}`);
        await this.patchSession(sessionId, { status: WcSessionStatus.FAILED });
        return;
      }
      let parsed: { chainId: string; pubkey: string };
      try {
        parsed = parseSolanaCaip10Account(fullSol);
      } catch (e) {
        this.logger.warn(`[WC-Auth] bad solana CAIP-10 sessionId=${sessionId}: ${fullSol}`, e);
        await this.patchSession(sessionId, { status: WcSessionStatus.FAILED });
        return;
      }
      address = parsed.pubkey;
      const chainId = parsed.chainId;
      if (chainId !== expectedCaip2) {
        this.logger.debug(
          `[WC-Auth] WC Solana chain ${chainId}; mong ${expectedCaip2} — vẫn ký với chain đã approve.`,
        );
      }

      await this.patchSession(sessionId, { status: WcSessionStatus.CONNECTED, address });

      const messageB58 = bs58.encode(Buffer.from(message, 'utf8'));
      const msLeftSign = Math.max(5_000, deadline - Date.now());

      try {
        const raw = await withWalletConnectTimeout(
          client.request({
            topic: wcSession.topic,
            chainId: chainId || expectedCaip2,
            request: {
              method: 'solana_signMessage',
              params: {
                message: messageB58,
                pubkey: address,
              },
            },
          }),
          Math.min(msLeftSign, 120_000),
          'WC_SIGN_TIMEOUT',
        );
        signature = solanaWcResultToBackendSignature(raw);
      } catch (e) {
        this.logger.warn(`[WC-Auth] solana_signMessage failed sessionId=${sessionId}`, e);
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
    } else {
      const accounts = wcSession?.namespaces?.eip155?.accounts ?? [];
      const fullAccount = accounts[0];
      if (!fullAccount) {
        this.logger.warn(`[WC-Auth] no eip155 account sessionId=${sessionId}`);
        await this.patchSession(sessionId, { status: WcSessionStatus.FAILED });
        return;
      }

      const sessionChainId = getChainFromAccount(fullAccount);
      if (sessionChainId !== expectedCaip2) {
        this.logger.debug(
          `[WC-Auth] WC session chain ${sessionChainId} (ký qua chain này); đăng nhập app vẫn ${chain} — message off-chain.`,
        );
      }

      address = getAddressFromAccount(fullAccount);
      await this.patchSession(sessionId, { status: WcSessionStatus.CONNECTED, address });

      const chainId = sessionChainId;
      const hexMsg = `0x${Buffer.from(message, 'utf8').toString('hex')}`;

      const msLeftSign = Math.max(5_000, deadline - Date.now());

      try {
        const raw = await withWalletConnectTimeout(
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

  private static isSolanaWcChain(chain: BlockchainNetwork): boolean {
    return chain === BlockchainNetwork.SOLANA_MAINNET || chain === BlockchainNetwork.SOLANA_DEVNET;
  }

  private assertWcChain(chain: BlockchainNetwork): void {
    try {
      wcCaip2ForChain(chain);
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw new BadRequestException(
          `Chain "${chain}" không được hỗ trợ cho WalletConnect đăng nhập công khai`,
          'WC_AUTH_CHAIN_NOT_SUPPORTED',
        );
      }
      throw e;
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

  private async patchSession(
    sessionId: string,
    partial: Partial<WcAuthSessionData>,
  ): Promise<void> {
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
