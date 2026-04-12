import { createHash, createHmac } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WalletConnectSignClient } from '@walletconnect/sign-client';
import { getAddressFromAccount, getChainFromAccount } from '@walletconnect/utils';
import bs58 from 'bs58';
import { uuidv7 } from 'uuidv7';
import { BlockchainNetwork } from '@/common/enums';
import { BadRequestException } from '@/common/exceptions';
import {
  isWcEvmChain,
  WC_RELAY_PAIRING_CHAINS,
  wcCaip2ForChain,
} from '@/modules/blockchain/wallet-connect/wc-caip.util';
import type { WcApprovedSession, WcConnectPairingResult } from '@/types/walletconnect-session';
import { BlockchainProviderFactory } from '../blockchain-provider.factory';
import { WalletLinkingService } from '../wallet-linking.service';
import { type WcSessionData, WcSessionStatus } from './dto';
import {
  formatWalletConnectInitError,
  parseSolanaCaip10Account,
  resolveWalletConnectProjectId,
  solanaWcResultToBackendSignature,
  withWalletConnectTimeout,
} from './wallet-connect-common.util';
import { WalletConnectSessionManager } from './wallet-connect-session-manager.service';
import { withWalletConnectSignClientLock } from './wallet-connect-sign-client-gate';

/**
 * WalletConnectService (liên kết ví đã đăng nhập)
 *
 * ETH_MAINNET / BSC_MAINNET / SOLANA_MAINNET + project id: SignClient + relay; ký `personal_sign` /
 * `solana_signMessage`. Thiếu project id: URI ghép (legacy) — QR không nối relay.
 *
 * Relay webhook (`/relay-webhook`) vẫn stub — không dùng cho luồng chính.
 */
@Injectable()
export class WalletConnectService implements OnModuleInit {
  private readonly logger = new Logger(WalletConnectService.name);

  /** TTL session chờ user scan (giây) */
  private static readonly SESSION_TTL = 300; // 5 phút
  /** Tránh POST /wc/init treo khi relay không phản hồi */
  private static readonly WC_CONNECT_TIMEOUT_MS = 15_000;

  private projectId!: string;
  private relayUrl!: string;
  private webhookSecret!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly sessionManager: WalletConnectSessionManager,
    private readonly walletLinkingService: WalletLinkingService,
    readonly _providerFactory: BlockchainProviderFactory,
  ) {}

  async onModuleInit() {
    this.projectId = resolveWalletConnectProjectId(this.configService);
    this.relayUrl = this.configService.get<string>(
      'WALLETCONNECT_RELAY_URL',
      'wss://relay.walletconnect.com',
    );
    this.webhookSecret = this.configService.get<string>('WALLETCONNECT_WEBHOOK_SECRET', '');

    if (!this.projectId) {
      this.logger.warn('[WalletConnect] Chưa có WALLETCONNECT_PROJECT_ID hoặc REOWN_PROJECT_ID!');
    } else {
      this.logger.log(
        `[WalletConnect] Khởi tạo với projectId=${this.projectId.substring(0, 8)}...`,
      );
    }
  }

  /**
   * Bước 1: Tạo WalletConnect session URI
   * FE dùng URI này để generate QR Code hoặc deep link
   */
  async initSession(
    userId: string,
    chain: BlockchainNetwork,
  ): Promise<{
    sessionId: string;
    wcUri: string;
    expiresIn: number;
    caip2Chain: string;
    relayPairing: boolean;
  }> {
    this.assertWcInitChain(chain);

    const sessionId = uuidv7();
    const nonce = uuidv7();
    const message = this.buildSigningMessage(nonce, chain);
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
                  const connectPromise = WalletConnectService.isSolanaWcChain(chain)
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
                    WalletConnectService.WC_CONNECT_TIMEOUT_MS,
                    'WC_INIT_CONNECT_TIMEOUT',
                  );
                  if (!uri) {
                    throw new Error('WalletConnect connect() returned empty uri');
                  }
                  const sessionData: WcSessionData = {
                    sessionId,
                    userId,
                    chain,
                    wcUri: uri,
                    nonce,
                    message,
                    status: WcSessionStatus.PENDING,
                    createdAt: Date.now(),
                  };
                  await this.sessionManager.saveSession(
                    userId,
                    sessionId,
                    sessionData,
                    WalletConnectService.SESSION_TTL,
                  );
                  resolveHttp({ wcUri: uri });
                  // Không await — giữ lock chỉ trong lúc connect(); nếu await pairing/sign
                  // thì mọi POST /wc/init khác (đổi sang BSC/Solana) bị treo hàng chục phút.
                  void this.runLinkApprovalAndSign(
                    userId,
                    sessionId,
                    chain,
                    message,
                    approval,
                    client,
                  ).catch((e) => {
                    this.logger.error(
                      `[WC] background pairing/sign error userId=${userId} sessionId=${sessionId}`,
                      e,
                    );
                  });
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
        this.logger.error('[WC] SignClient connect failed (link wallet)', e);
        const msg = formatWalletConnectInitError(e);
        throw new BadRequestException(msg, 'WC_LINK_INIT_FAILED');
      }
    } else {
      wcUri = await this.buildWcUri(sessionId, caip2, message);
      const sessionData: WcSessionData = {
        sessionId,
        userId,
        chain,
        wcUri,
        nonce,
        message,
        status: WcSessionStatus.PENDING,
        createdAt: Date.now(),
      };
      await this.sessionManager.saveSession(
        userId,
        sessionId,
        sessionData,
        WalletConnectService.SESSION_TTL,
      );
    }

    const relayPairing = this.useRealWcPairing(chain);
    this.logger.debug(
      `[WC] initSession: userId=${userId}, sessionId=${sessionId}, chain=${chain}, relayPairing=${relayPairing}`,
    );

    return {
      sessionId,
      wcUri,
      expiresIn: WalletConnectService.SESSION_TTL,
      caip2Chain: caip2,
      relayPairing,
    };
  }

  /**
   * Bước 2: Lấy trạng thái session
   * FE poll mỗi 2s để biết khi nào user đã ký
   */
  async getSessionStatus(
    userId: string,
    sessionId: string,
  ): Promise<{
    sessionId: string;
    status: WcSessionStatus;
    address?: string;
    expiresAt?: number;
    signature?: string;
  }> {
    const session = await this.sessionManager.loadSession(userId, sessionId);

    if (!session) {
      return { sessionId, status: WcSessionStatus.EXPIRED };
    }

    const expiresAt = session.createdAt + WalletConnectService.SESSION_TTL * 1000;

    // Kiểm tra TTL thủ công (Redis TTL đã handle, nhưng double-check)
    if (Date.now() > expiresAt) {
      await this.sessionManager.deleteSession(userId, sessionId);
      return { sessionId, status: WcSessionStatus.EXPIRED };
    }

    return {
      sessionId,
      status: session.status,
      address: session.address,
      signature: session.signature,
      expiresAt,
    };
  }

  /**
   * Bước 3: Nhận relay webhook callback từ WalletConnect
   *
   * WC relay gọi về đây khi có event (session_connect, session_delete, v.v.)
   * Payload được ký bằng JWT/HMAC từ WC relay — cần verify trước khi xử lý.
   *
   * Relay Webhook (irn_watchRegister) trả về raw IRN message dạng:
   * {
   *   "topic": "<pairing-topic>",
   *   "message": "<encrypted-base64>",
   *   "publishedAt": 1234567890,
   *   "tag": 1100  // 1100 = session_propose, 1108 = session_settle
   * }
   */
  async handleRelayWebhook(
    payload: Record<string, any>,
    hmacSignature?: string,
  ): Promise<{ processed: boolean; sessionId?: string }> {
    // Verify HMAC signature nếu có webhook secret
    if (this.webhookSecret && hmacSignature) {
      const isValid = this.verifyHmac(JSON.stringify(payload), hmacSignature);
      if (!isValid) {
        this.logger.warn('[WC] Relay webhook HMAC verification failed');
        throw new BadRequestException('Invalid webhook signature', 'INVALID_WEBHOOK_SIGNATURE');
      }
    }

    const topic = payload?.topic as string;
    const tag = payload?.tag as number;

    if (!topic) {
      this.logger.debug('[WC] Relay webhook payload không có topic, bỏ qua');
      return { processed: false };
    }

    this.logger.debug(`[WC] Relay webhook: topic=${topic}, tag=${tag}`);

    // Tag 1108 = session_settle (wallet đã connect thành công)
    if (tag === 1108) {
      await this.handleSessionSettle(topic, payload);
      return { processed: true };
    }

    // Tag 1116 = session_request (wallet gửi signature)
    if (tag === 1116) {
      const sessionId = await this.handleSessionRequest(topic, payload);
      return { processed: true, sessionId };
    }

    return { processed: false };
  }

  /**
   * Bước 4 (khi FE nhận được signature từ WC SDK trực tiếp):
   * FE gọi endpoint này để cập nhật session + trigger verify-link
   *
   * Alternative flow: thay vì dùng relay webhook (phức tạp), FE tự
   * nhận signature từ WC SDK event listener, rồi gửi lên BE để verify.
   * Đây là approach được WalletConnect khuyến nghị cho DApp side.
   */
  async submitSignature(
    userId: string,
    sessionId: string,
    address: string,
    signature: string,
    chain: BlockchainNetwork,
  ): Promise<{
    linkId: string;
    chain: string;
    address: string;
    status: string;
  }> {
    const session = await this.sessionManager.loadSession(userId, sessionId);

    if (!session) {
      throw new BadRequestException(
        'Session WalletConnect đã hết hạn hoặc không tồn tại',
        'WC_SESSION_EXPIRED',
      );
    }

    if (session.chain !== chain) {
      throw new BadRequestException(
        `Chain không khớp: session chain=${session.chain}, submitted chain=${chain}`,
        'WC_CHAIN_MISMATCH',
      );
    }

    if (session.status === WcSessionStatus.SIGNED) {
      const addrOk = WalletConnectService.isEvmWcChain(chain)
        ? session.address?.toLowerCase() === address.toLowerCase()
        : session.address === address;
      const sigOk = session.signature === signature;
      if (!addrOk || !sigOk) {
        throw new BadRequestException(
          'Session đã ký — address/signature không khớp với phiên hiện tại',
          'WC_SESSION_SIGNATURE_MISMATCH',
        );
      }
      return this.finalizeWalletLink(userId, sessionId, session, address, signature, chain);
    }

    await this.sessionManager.updateSession(
      userId,
      sessionId,
      {
        status: WcSessionStatus.SIGNED,
        address,
        signature,
      },
      WalletConnectService.SESSION_TTL,
    );

    const updated = await this.sessionManager.loadSession(userId, sessionId);
    if (!updated) {
      throw new BadRequestException(
        'Session WalletConnect đã hết hạn hoặc không tồn tại',
        'WC_SESSION_EXPIRED',
      );
    }

    return this.finalizeWalletLink(userId, sessionId, updated, address, signature, chain);
  }

  private useRealWcPairing(chain: BlockchainNetwork): boolean {
    return WC_RELAY_PAIRING_CHAINS.includes(chain) && Boolean(this.projectId);
  }

  private async runLinkApprovalAndSign(
    userId: string,
    sessionId: string,
    chain: BlockchainNetwork,
    message: string,
    approval: () => Promise<WcApprovedSession>,
    client: WalletConnectSignClient,
  ): Promise<void> {
    const loaded = await this.sessionManager.loadSession(userId, sessionId);
    if (!loaded) return;

    const deadline = loaded.createdAt + WalletConnectService.SESSION_TTL * 1000;
    const msLeftPairing = Math.max(5_000, deadline - Date.now());

    let wcSession: WcApprovedSession;
    try {
      wcSession = await withWalletConnectTimeout(approval(), msLeftPairing, 'WC_PAIRING_TIMEOUT');
    } catch (e) {
      this.logger.warn(`[WC] pairing failed sessionId=${sessionId}`, e);
      await this.sessionManager.updateSession(
        userId,
        sessionId,
        { status: WcSessionStatus.FAILED },
        WalletConnectService.SESSION_TTL,
      );
      return;
    }

    const expectedCaip2 = wcCaip2ForChain(chain);

    let address: string;
    let chainId: string;
    let signature: string;

    if (WalletConnectService.isSolanaWcChain(chain)) {
      const solAccounts = wcSession?.namespaces?.solana?.accounts ?? [];
      const fullSol = solAccounts[0];
      if (!fullSol) {
        this.logger.warn(`[WC] no solana account sessionId=${sessionId}`);
        await this.sessionManager.updateSession(
          userId,
          sessionId,
          { status: WcSessionStatus.FAILED },
          WalletConnectService.SESSION_TTL,
        );
        return;
      }
      let parsed: { chainId: string; pubkey: string };
      try {
        parsed = parseSolanaCaip10Account(fullSol);
      } catch (e) {
        this.logger.warn(`[WC] bad solana CAIP-10 account sessionId=${sessionId}: ${fullSol}`, e);
        await this.sessionManager.updateSession(
          userId,
          sessionId,
          { status: WcSessionStatus.FAILED },
          WalletConnectService.SESSION_TTL,
        );
        return;
      }
      address = parsed.pubkey;
      chainId = parsed.chainId;
      if (chainId !== expectedCaip2) {
        this.logger.debug(
          `[WC] WC Solana chain ${chainId}; mong đợi ${expectedCaip2} — vẫn thử ký với chain đã approve.`,
        );
      }

      await this.sessionManager.updateSession(
        userId,
        sessionId,
        {
          status: WcSessionStatus.CONNECTED,
          address,
        },
        WalletConnectService.SESSION_TTL,
      );

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
        this.logger.warn(`[WC] solana_signMessage failed sessionId=${sessionId}`, e);
        await this.sessionManager.updateSession(
          userId,
          sessionId,
          { status: WcSessionStatus.FAILED, address },
          WalletConnectService.SESSION_TTL,
        );
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
        this.logger.warn(`[WC] no eip155 account sessionId=${sessionId}`);
        await this.sessionManager.updateSession(
          userId,
          sessionId,
          { status: WcSessionStatus.FAILED },
          WalletConnectService.SESSION_TTL,
        );
        return;
      }

      const sessionChainId = getChainFromAccount(fullAccount);
      if (sessionChainId !== expectedCaip2) {
        this.logger.debug(
          `[WC] WC session chain ${sessionChainId}; liên kết app vẫn ${chain} — personal_sign off-chain.`,
        );
      }

      address = getAddressFromAccount(fullAccount);
      await this.sessionManager.updateSession(
        userId,
        sessionId,
        {
          status: WcSessionStatus.CONNECTED,
          address,
        },
        WalletConnectService.SESSION_TTL,
      );

      chainId = sessionChainId;
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
        this.logger.warn(`[WC] personal_sign failed sessionId=${sessionId}`, e);
        await this.sessionManager.updateSession(
          userId,
          sessionId,
          { status: WcSessionStatus.FAILED, address },
          WalletConnectService.SESSION_TTL,
        );
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

    await this.sessionManager.updateSession(
      userId,
      sessionId,
      {
        status: WcSessionStatus.SIGNED,
        address,
        signature,
      },
      WalletConnectService.SESSION_TTL,
    );

    try {
      await client.disconnect({
        topic: wcSession.topic,
        reason: { code: 6000, message: 'Link signing completed' },
      });
    } catch (dcErr) {
      this.logger.warn(`[WC] disconnect: ${dcErr}`);
    }
  }

  private async finalizeWalletLink(
    userId: string,
    sessionId: string,
    session: WcSessionData,
    address: string,
    signature: string,
    chain: BlockchainNetwork,
  ): Promise<{
    linkId: string;
    chain: string;
    address: string;
    status: string;
  }> {
    await this.walletLinkingService.requestLink(userId, {
      chain: chain as BlockchainNetwork,
      address,
      label: `WalletConnect - ${new Date().toLocaleDateString('vi-VN')}`,
    });

    await this.sessionManager.overrideNonceMessage(userId, chain, address, session.message, 60);

    const result = await this.walletLinkingService.verifyLink(userId, {
      chain: chain as BlockchainNetwork,
      address,
      signature,
    });

    await this.sessionManager.deleteSession(userId, sessionId);

    this.logger.log(
      `[WC] submitSignature thành công: userId=${userId}, chain=${chain}, address=${address}`,
    );

    return result;
  }

  // ============ Private Helpers ============

  private static isSolanaWcChain(chain: BlockchainNetwork): boolean {
    return chain === BlockchainNetwork.SOLANA_MAINNET || chain === BlockchainNetwork.SOLANA_DEVNET;
  }

  private static isEvmWcChain(chain: BlockchainNetwork): boolean {
    return isWcEvmChain(chain);
  }

  private assertWcInitChain(chain: BlockchainNetwork): void {
    wcCaip2ForChain(chain);
  }

  private buildSigningMessage(nonce: string, chain: BlockchainNetwork): string {
    return `Crypto Trading Platform - Liên kết ví\n\nNonce: ${nonce}\nChain: ${chain}\n\nKý message này để xác minh quyền sở hữu ví.`;
  }

  /**
   * Build WalletConnect v2 URI theo chuẩn EIP-1328 / WC spec
   * Format: wc:{topic}@2?relay-protocol=irn&symKey={symKey}
   *
   * Trong production: dùng @walletconnect/core SignClient.connect() để sinh URI
   * Ở đây ta build URI theo cách đơn giản để không cần chạy WebSocket server
   * trên NestJS (WC relay server đảm nhận việc đó).
   *
   * Approach thực tế: FE dùng walletconnect_flutter_v2 SDK tự init session
   * và generate URI, sau đó gửi URI này lên BE để BE lưu + track.
   */
  private async buildWcUri(
    sessionId: string,
    _caip2Chain: string,
    _signingMessage: string,
  ): Promise<string> {
    // Topic là random bytes (32 bytes hex) — đây là pairing topic
    const topic = createHash('sha256')
      .update(`${sessionId}:${Date.now()}:${this.projectId}`)
      .digest('hex');

    // symKey (symmetric encryption key cho relay)
    const symKey = createHash('sha256')
      .update(`${sessionId}:symkey:${this.projectId}`)
      .digest('hex');

    const _relayDomain = 'relay.walletconnect.com';
    const params = new URLSearchParams();
    params.set('relay-protocol', 'irn');
    params.set('symKey', symKey);
    params.set('expiryTimestamp', String(Math.floor(Date.now() / 1000) + 300));

    // WC v2 URI format
    return `wc:${topic}@2?${params.toString()}&projectId=${this.projectId}`;
  }

  private async handleSessionSettle(topic: string, _payload: any): Promise<void> {
    // Tìm session theo topic (scan Redis keys) — trong production dùng secondary index
    this.logger.debug(`[WC] session_settle: topic=${topic}`);
    // TODO: Map topic → sessionId để update status
  }

  private async handleSessionRequest(topic: string, _payload: any): Promise<string | undefined> {
    this.logger.debug(`[WC] session_request: topic=${topic}`);
    return undefined;
  }

  private verifyHmac(body: string, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(body).digest('hex');
    return expected === signature;
  }
}
