import { Injectable } from '@nestjs/common';
import type { BlockchainNetwork } from '@/common/enums';
import { CacheService } from '@/common/services';
import type { WcSessionData } from './dto';

@Injectable()
export class WalletConnectSessionManager {
  constructor(private readonly cacheService: CacheService) {}

  async saveSession(
    userId: string,
    sessionId: string,
    data: WcSessionData,
    ttlSec: number,
  ): Promise<void> {
    await this.cacheService.set(this.sessionKey(userId, sessionId), data, ttlSec);
  }

  async loadSession(userId: string, sessionId: string): Promise<WcSessionData | null> {
    return this.cacheService.get<WcSessionData>(this.sessionKey(userId, sessionId));
  }

  async updateSession(
    userId: string,
    sessionId: string,
    partial: Partial<WcSessionData>,
    ttlSec: number,
  ): Promise<void> {
    const existing = await this.loadSession(userId, sessionId);
    if (!existing) return;

    const remaining = Math.floor((existing.createdAt + ttlSec * 1000 - Date.now()) / 1000);
    if (remaining <= 0) {
      return;
    }

    await this.cacheService.set(
      this.sessionKey(userId, sessionId),
      { ...existing, ...partial },
      remaining,
    );
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.cacheService.delete(this.sessionKey(userId, sessionId));
  }

  async overrideNonceMessage(
    userId: string,
    chain: BlockchainNetwork,
    address: string,
    message: string,
    ttlSec: number,
  ): Promise<void> {
    const nonceKey = `wallet:link:nonce:${userId}:${chain}:${address}`;
    const existing = await this.cacheService.get<Record<string, unknown>>(nonceKey);
    if (!existing) {
      return;
    }
    await this.cacheService.set(nonceKey, { ...existing, message }, ttlSec);
  }

  private sessionKey(userId: string, sessionId: string): string {
    return `wc:session:${userId}:${sessionId}`;
  }
}
