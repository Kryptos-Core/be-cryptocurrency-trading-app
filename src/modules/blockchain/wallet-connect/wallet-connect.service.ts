import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { uuidv7 } from 'uuidv7';
import { CacheService } from '@/common/services';
import { BadRequestException } from '@/common/exceptions';
import { BlockchainNetwork } from '@/common/enums';
import { WalletLinkingService } from '../wallet-linking.service';
import { BlockchainProviderFactory } from '../blockchain-provider.factory';
import { WcSessionData, WcSessionStatus } from './dto';

/**
 * WalletConnectService
 *
 * Patterns:
 *  - Facade Pattern: ẩn phức tạp của WC SDK, chỉ expose initSession / getStatus
 *  - Strategy Pattern: delegate verify sang WalletLinkingService (tái dụng logic)
 *  - Observer Pattern: nhận relay webhook callback, update Redis session state
 *
 * WalletConnect v2 Flow:
 *  1. FE gọi POST /wc/init → BE tạo WC SignClient, generate URI, lưu Redis
 *  2. FE hiển thị QR chứa URI → User scan bằng mobile wallet
 *  3. Wallet connect session → WC relay gọi webhook về BE (irn_watchRegister)
 *  4. FE poll GET /wc/status/:sessionId → khi SIGNED, FE gọi verify-link
 *  5. BE verify chữ ký on-chain → tạo linked_wallet record
 *
 * Note: WalletConnect relay webhook gọi về /blockchain/wallets/wc/relay-webhook
 *       BE cần verify HMAC hoặc JWT từ client ID của WC SDK.
 */
@Injectable()
export class WalletConnectService implements OnModuleInit {
  private readonly logger = new Logger(WalletConnectService.name);

  /** TTL session chờ user scan (giây) */
  private static readonly SESSION_TTL = 300; // 5 phút
  /** EVM chains được hỗ trợ qua WalletConnect */
  private static readonly EVM_CHAINS: BlockchainNetwork[] = [
    BlockchainNetwork.ETH_SEPOLIA,
    BlockchainNetwork.SOLANA_DEVNET,
  ];
  /** CAIP-2 namespace mapping */
  private static readonly CHAIN_CAIP: Record<string, string> = {
    [BlockchainNetwork.ETH_SEPOLIA]: 'eip155:11155111',
    [BlockchainNetwork.SOLANA_DEVNET]: 'solana:EtWTRAqHX4t7hs',
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
    this.projectId = this.configService.get<string>('WALLETCONNECT_PROJECT_ID', '');
    this.relayUrl = this.configService.get<string>(
      'WALLETCONNECT_RELAY_URL',
      'wss://relay.walletconnect.com',
    );
    this.webhookSecret = this.configService.get<string>('WALLETCONNECT_WEBHOOK_SECRET', '');

    if (!this.projectId) {
      this.logger.warn('[WalletConnect] WALLETCONNECT_PROJECT_ID chưa được cấu hình!');
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
  }> {
    this.assertEvmChain(chain);

    // Tạo signing nonce + message (tái dụng logic từ WalletLinkingService)
    const sessionId = uuidv7();
    const nonce = uuidv7();
    const message = this.buildSigningMessage(nonce, chain);
    const caip2 = WalletConnectService.CHAIN_CAIP[chain];

    // Build WalletConnect URI theo spec v2
    // Format: wc:{topic}@2?relay-protocol=irn&symKey={key}&expiryTimestamp={ts}
    // Trong thực tế SDK sinh ra URI — ở đây ta dùng approach "pairing URI" qua REST
    // (WC Cloud REST API hoặc tự build URI với @walletconnect/core)
    const wcUri = await this.buildWcUri(sessionId, caip2, message);

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

    this.logger.debug(`[WC] initSession: userId=${userId}, sessionId=${sessionId}, chain=${chain}`);

    return {
      sessionId,
      wcUri,
      expiresIn: WalletConnectService.SESSION_TTL,
      caip2Chain: caip2,
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

    if (session.status === WcSessionStatus.SIGNED) {
      throw new BadRequestException(
        'Session này đã được xử lý rồi',
        'WC_SESSION_ALREADY_USED',
      );
    }

    // Validate chain khớp với session
    if (session.chain !== chain) {
      throw new BadRequestException(
        `Chain không khớp: session chain=${session.chain}, submitted chain=${chain}`,
        'WC_CHAIN_MISMATCH',
      );
    }

    // Lưu address + signature vào session
    await this.updateSession(userId, sessionId, {
      status: WcSessionStatus.SIGNED,
      address,
      signature,
    });

    // Bước 1: Tạo nonce challenge trong WalletLinkingService (dùng lại Redis nonce)
    await this.walletLinkingService.requestLink(userId, {
      chain: chain as BlockchainNetwork,
      address,
      label: `WalletConnect - ${new Date().toLocaleDateString('vi-VN')}`,
    });

    // Override nonce trong Redis với message của session này
    // (WalletLinkingService dùng message của nó, ta inject message của WC session)
    await this.overrideNonceMessage(userId, chain, address, session.message);

    // Bước 2: Verify signature → link wallet
    const result = await this.walletLinkingService.verifyLink(userId, {
      chain: chain as BlockchainNetwork,
      address,
      signature,
    });

    // Xóa session sau khi xử lý thành công
    await this.deleteSession(userId, sessionId);

    this.logger.log(
      `[WC] submitSignature thành công: userId=${userId}, chain=${chain}, address=${address}`,
    );

    return result;
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
