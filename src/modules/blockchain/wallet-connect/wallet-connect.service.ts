import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import bs58 from 'bs58';
import type { SessionTypes } from '@walletconnect/types';
import { getAddressFromAccount, getChainFromAccount } from '@walletconnect/utils';
import type SignClient from '@walletconnect/sign-client';
import { uuidv7 } from 'uuidv7';
import { CacheService } from '@/common/services';
import { BadRequestException } from '@/common/exceptions';
import { BlockchainNetwork } from '@/common/enums';
import { WalletLinkingService } from '../wallet-linking.service';
import { BlockchainProviderFactory } from '../blockchain-provider.factory';
import { WcSessionData, WcSessionStatus } from './dto';
import { getWalletConnectDappClient } from './walletconnect-dapp-client.factory';

/**
 * WalletConnectService
 *
 * Sepolia hoặc Solana devnet + project id: SignClient + relay thật; ký tương ứng `personal_sign` /
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
  /** EVM chains được hỗ trợ qua WalletConnect */
  private static readonly EVM_CHAINS: BlockchainNetwork[] = [
    BlockchainNetwork.ETH_SEPOLIA,
    BlockchainNetwork.SOLANA_DEVNET,
  ];
  /** CAIP-2 namespace mapping */
  private static readonly CHAIN_CAIP: Record<string, string> = {
    [BlockchainNetwork.ETH_SEPOLIA]: 'eip155:11155111',
    // CAIP-2 devnet: genesis hash 32 ký tự đầu (chainagnostic namespaces/solana-caip2)
    [BlockchainNetwork.SOLANA_DEVNET]: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  };

  private projectId!: string;
  private relayUrl!: string;
  private webhookSecret!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly walletLinkingService: WalletLinkingService,
    private readonly providerFactory: BlockchainProviderFactory,
  ) {}

  async onModuleInit() {
    const raw =
      (this.configService.get<string>('WALLETCONNECT_PROJECT_ID', '') ?? '').trim() ||
      (this.configService.get<string>('REOWN_PROJECT_ID', '') ?? '').trim();
    this.projectId = raw;
    this.relayUrl = this.configService.get<string>(
      'WALLETCONNECT_RELAY_URL',
      'wss://relay.walletconnect.com',
    );
    this.webhookSecret = this.configService.get<string>('WALLETCONNECT_WEBHOOK_SECRET', '');

    if (!this.projectId) {
      this.logger.warn(
        '[WalletConnect] Chưa có WALLETCONNECT_PROJECT_ID hoặc REOWN_PROJECT_ID!',
      );
    } else {
      this.logger.log(`[WalletConnect] Khởi tạo với projectId=${this.projectId.substring(0, 8)}...`);
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
    this.assertEvmChain(chain);

    const sessionId = uuidv7();
    const nonce = uuidv7();
    const message = this.buildSigningMessage(nonce, chain);
    const caip2 = WalletConnectService.CHAIN_CAIP[chain];

    let wcUri: string;

    if (this.useRealWcPairing(chain)) {
      try {
        const client = await getWalletConnectDappClient({
          projectId: this.projectId,
          relayUrl: this.relayUrl,
        });
        const connectPromise =
          chain === BlockchainNetwork.SOLANA_DEVNET
            ? client.connect({
                optionalNamespaces: {
                  solana: {
                    chains: [WalletConnectService.CHAIN_CAIP[BlockchainNetwork.SOLANA_DEVNET]],
                    methods: ['solana_signMessage', 'solana_signTransaction'],
                    events: [],
                  },
                },
              })
            : client.connect({
                optionalNamespaces: {
                  eip155: {
                    chains: ['eip155:11155111'],
                    methods: ['personal_sign', 'eth_sendTransaction'],
                    events: [],
                  },
                },
              });
        const { uri, approval } = await this.withTimeout(
          connectPromise,
          WalletConnectService.WC_CONNECT_TIMEOUT_MS,
          'WC_INIT_CONNECT_TIMEOUT',
        );
        if (!uri) {
          throw new Error('WalletConnect connect() returned empty uri');
        }
        wcUri = uri;
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
        await this.saveSession(userId, sessionId, sessionData);
        void this.runLinkApprovalAndSign(userId, sessionId, chain, message, approval, client).catch(
          (e) =>
            this.logger.error(
              `[WC] background pairing/sign error userId=${userId} sessionId=${sessionId}`,
              e,
            ),
        );
      } catch (e) {
        this.logger.error('[WC] SignClient connect failed (link wallet)', e);
        const msg = WalletConnectService.formatWcInitError(e);
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
      await this.saveSession(userId, sessionId, sessionData);
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
    const session = await this.loadSession(userId, sessionId);

    if (!session) {
      return { sessionId, status: WcSessionStatus.EXPIRED };
    }

    const expiresAt = session.createdAt + WalletConnectService.SESSION_TTL * 1000;

    // Kiểm tra TTL thủ công (Redis TTL đã handle, nhưng double-check)
    if (Date.now() > expiresAt) {
      await this.deleteSession(userId, sessionId);
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
    const session = await this.loadSession(userId, sessionId);

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
      const addrOk =
        chain === BlockchainNetwork.ETH_SEPOLIA
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

    await this.updateSession(userId, sessionId, {
      status: WcSessionStatus.SIGNED,
      address,
      signature,
    });

    const updated = await this.loadSession(userId, sessionId);
    if (!updated) {
      throw new BadRequestException(
        'Session WalletConnect đã hết hạn hoặc không tồn tại',
        'WC_SESSION_EXPIRED',
      );
    }

    return this.finalizeWalletLink(userId, sessionId, updated, address, signature, chain);
  }

  private useRealWcPairing(chain: BlockchainNetwork): boolean {
    return (
      (chain === BlockchainNetwork.ETH_SEPOLIA ||
        chain === BlockchainNetwork.SOLANA_DEVNET) &&
      Boolean(this.projectId)
    );
  }

  private async runLinkApprovalAndSign(
    userId: string,
    sessionId: string,
    chain: BlockchainNetwork,
    message: string,
    approval: () => Promise<SessionTypes.Struct>,
    client: SignClient,
  ): Promise<void> {
    const loaded = await this.loadSession(userId, sessionId);
    if (!loaded) return;

    const deadline = loaded.createdAt + WalletConnectService.SESSION_TTL * 1000;
    const msLeftPairing = Math.max(5_000, deadline - Date.now());

    let wcSession: SessionTypes.Struct;
    try {
      wcSession = await this.withTimeout(approval(), msLeftPairing, 'WC_PAIRING_TIMEOUT');
    } catch (e) {
      this.logger.warn(`[WC] pairing failed sessionId=${sessionId}`, e);
      await this.updateSession(userId, sessionId, { status: WcSessionStatus.FAILED });
      return;
    }

    const expectedCaip2 = WalletConnectService.CHAIN_CAIP[chain];

    let address: string;
    let chainId: string;
    let signature: string;

    if (chain === BlockchainNetwork.SOLANA_DEVNET) {
      const solAccounts = wcSession?.namespaces?.solana?.accounts ?? [];
      const fullSol = solAccounts[0];
      if (!fullSol) {
        this.logger.warn(`[WC] no solana account sessionId=${sessionId}`);
        await this.updateSession(userId, sessionId, { status: WcSessionStatus.FAILED });
        return;
      }
      let parsed: { chainId: string; pubkey: string };
      try {
        parsed = WalletConnectService.parseSolanaCaip10Account(fullSol);
      } catch (e) {
        this.logger.warn(`[WC] bad solana CAIP-10 account sessionId=${sessionId}: ${fullSol}`, e);
        await this.updateSession(userId, sessionId, { status: WcSessionStatus.FAILED });
        return;
      }
      address = parsed.pubkey;
      chainId = parsed.chainId;
      if (chainId !== expectedCaip2) {
        this.logger.debug(
          `[WC] WC Solana chain ${chainId}; mong đợi ${expectedCaip2} — vẫn thử ký với chain đã approve.`,
        );
      }

      await this.updateSession(userId, sessionId, {
        status: WcSessionStatus.CONNECTED,
        address,
      });

      const messageB58 = bs58.encode(Buffer.from(message, 'utf8'));
      const msLeftSign = Math.max(5_000, deadline - Date.now());

      try {
        const raw = await this.withTimeout(
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
        signature = WalletConnectService.solanaWcResultToBackendSignature(raw);
      } catch (e) {
        this.logger.warn(`[WC] solana_signMessage failed sessionId=${sessionId}`, e);
        await this.updateSession(userId, sessionId, { status: WcSessionStatus.FAILED, address });
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
        await this.updateSession(userId, sessionId, { status: WcSessionStatus.FAILED });
        return;
      }

      const sessionChainId = getChainFromAccount(fullAccount);
      if (sessionChainId !== expectedCaip2) {
        this.logger.debug(
          `[WC] WC session chain ${sessionChainId}; liên kết app vẫn ${chain} — personal_sign off-chain.`,
        );
      }

      address = getAddressFromAccount(fullAccount);
      await this.updateSession(userId, sessionId, {
        status: WcSessionStatus.CONNECTED,
        address,
      });

      chainId = sessionChainId;
      const hexMsg = `0x${Buffer.from(message, 'utf8').toString('hex')}`;
      const msLeftSign = Math.max(5_000, deadline - Date.now());

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
        this.logger.warn(`[WC] personal_sign failed sessionId=${sessionId}`, e);
        await this.updateSession(userId, sessionId, { status: WcSessionStatus.FAILED, address });
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

    await this.updateSession(userId, sessionId, {
      status: WcSessionStatus.SIGNED,
      address,
      signature,
    });

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

    await this.overrideNonceMessage(userId, chain, address, session.message);

    const result = await this.walletLinkingService.verifyLink(userId, {
      chain: chain as BlockchainNetwork,
      address,
      signature,
    });

    await this.deleteSession(userId, sessionId);

    this.logger.log(
      `[WC] submitSignature thành công: userId=${userId}, chain=${chain}, address=${address}`,
    );

    return result;
  }

  /** CAIP-10 `solana:<ref>:<pubkey>` */
  private static parseSolanaCaip10Account(full: string): { chainId: string; pubkey: string } {
    const prefix = 'solana:';
    if (!full.startsWith(prefix)) {
      throw new Error(`Invalid Solana CAIP-10 account: ${full}`);
    }
    const rest = full.slice(prefix.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) {
      throw new Error(`Invalid Solana CAIP-10 account: ${full}`);
    }
    const ref = rest.slice(0, colonIdx);
    const pubkey = rest.slice(colonIdx + 1);
    return { chainId: `solana:${ref}`, pubkey };
  }

  /** WC trả signature base58; `SolanaProvider.verifySignature` cần base64 (64 byte ed25519). */
  private static solanaWcResultToBackendSignature(raw: unknown): string {
    const sigStr =
      typeof raw === 'string'
        ? raw
        : raw &&
            typeof raw === 'object' &&
            raw !== null &&
            'signature' in raw &&
            typeof (raw as { signature: unknown }).signature === 'string'
          ? (raw as { signature: string }).signature
          : '';
    if (!sigStr) {
      throw new Error('Wallet returned empty Solana signature');
    }
    try {
      const bytes = bs58.decode(sigStr);
      return Buffer.from(bytes).toString('base64');
    } catch {
      const asB64 = Buffer.from(sigStr, 'base64');
      if (asB64.length === 64) {
        return sigStr;
      }
      throw new Error('Could not decode Solana signature from wallet');
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

  // ============ Private Helpers ============

  private assertEvmChain(chain: BlockchainNetwork): void {
    if (!WalletConnectService.EVM_CHAINS.includes(chain)) {
      throw new BadRequestException(
        `Chain "${chain}" không được hỗ trợ qua WalletConnect. Chỉ hỗ trợ EVM chains: ${WalletConnectService.EVM_CHAINS.join(', ')}`,
        'WC_CHAIN_NOT_SUPPORTED',
      );
    }
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
    caip2Chain: string,
    signingMessage: string,
  ): Promise<string> {
    // Topic là random bytes (32 bytes hex) — đây là pairing topic
    const topic = createHash('sha256')
      .update(`${sessionId}:${Date.now()}:${this.projectId}`)
      .digest('hex');

    // symKey (symmetric encryption key cho relay)
    const symKey = createHash('sha256')
      .update(`${sessionId}:symkey:${this.projectId}`)
      .digest('hex');

    const relayDomain = 'relay.walletconnect.com';
    const params = new URLSearchParams();
    params.set('relay-protocol', 'irn');
    params.set('symKey', symKey);
    params.set('expiryTimestamp', String(Math.floor(Date.now() / 1000) + 300));

    // WC v2 URI format
    return `wc:${topic}@2?${params.toString()}&projectId=${this.projectId}`;
  }

  private sessionKey(userId: string, sessionId: string): string {
    return `wc:session:${userId}:${sessionId}`;
  }

  private async saveSession(
    userId: string,
    sessionId: string,
    data: WcSessionData,
  ): Promise<void> {
    await this.cacheService.set(
      this.sessionKey(userId, sessionId),
      data,
      WalletConnectService.SESSION_TTL,
    );
  }

  private async loadSession(
    userId: string,
    sessionId: string,
  ): Promise<WcSessionData | null> {
    return this.cacheService.get<WcSessionData>(this.sessionKey(userId, sessionId));
  }

  private async updateSession(
    userId: string,
    sessionId: string,
    partial: Partial<WcSessionData>,
  ): Promise<void> {
    const existing = await this.loadSession(userId, sessionId);
    if (!existing) return;

    const remaining = Math.floor(
      (existing.createdAt + WalletConnectService.SESSION_TTL * 1000 - Date.now()) / 1000,
    );
    if (remaining <= 0) return;

    await this.cacheService.set(
      this.sessionKey(userId, sessionId),
      { ...existing, ...partial },
      remaining,
    );
  }

  private async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.cacheService.delete(this.sessionKey(userId, sessionId));
  }

  private async handleSessionSettle(topic: string, payload: any): Promise<void> {
    // Tìm session theo topic (scan Redis keys) — trong production dùng secondary index
    this.logger.debug(`[WC] session_settle: topic=${topic}`);
    // TODO: Map topic → sessionId để update status
  }

  private async handleSessionRequest(topic: string, payload: any): Promise<string | undefined> {
    this.logger.debug(`[WC] session_request: topic=${topic}`);
    return undefined;
  }

  private verifyHmac(body: string, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(body).digest('hex');
    return expected === signature;
  }

  /**
   * Override nonce message trong Redis để WalletLinkingService dùng đúng message của WC session
   */
  private async overrideNonceMessage(
    userId: string,
    chain: BlockchainNetwork,
    address: string,
    message: string,
  ): Promise<void> {
    const nonceKey = `wallet:link:nonce:${userId}:${chain}:${address}`;
    const existing = await this.cacheService.get<any>(nonceKey);
    if (existing) {
      await this.cacheService.set(nonceKey, { ...existing, message }, 60);
    }
  }
}
