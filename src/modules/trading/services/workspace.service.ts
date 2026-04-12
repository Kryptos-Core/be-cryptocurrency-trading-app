import { Injectable, Logger } from '@nestjs/common';
import type { RedisService } from '@/common/services';
import type { WorkspaceState, WorkspaceSubscription } from '../interfaces/websocket.interface';

const WORKSPACE_TTL_SEC = 24 * 3600; // 24 hours

/**
 * Workspace Service
 *
 * Persists each authenticated user's active Socket.IO subscriptions in Redis so
 * that on reconnect the server can restore rooms without the client re-sending
 * all subscribe messages.
 *
 * Key pattern: `ws:workspace:{userId}`
 * Value: JSON-serialized WorkspaceState
 * TTL: 24 hours (reset on every update)
 */
@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(private readonly redisService: RedisService) {}

  private key(userId: string): string {
    return `ws:workspace:${userId}`;
  }

  /**
   * Load workspace state for a user. Returns null when no state is stored.
   */
  async getWorkspace(userId: string): Promise<WorkspaceState | null> {
    try {
      const raw = await this.redisService.get(this.key(userId));
      if (!raw) return null;
      return JSON.parse(raw) as WorkspaceState;
    } catch (err) {
      this.logger.warn(
        `getWorkspace error for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Upsert a single pair subscription into the user's workspace.
   * Replaces an existing entry for the same pair_id (to reflect interval changes).
   */
  async upsertPairSubscription(userId: string, sub: WorkspaceSubscription): Promise<void> {
    try {
      const existing = await this.getWorkspace(userId);
      const pairs: WorkspaceSubscription[] = existing?.pairs ?? [];

      const idx = pairs.findIndex((p) => p.pair_id === sub.pair_id);
      if (idx >= 0) {
        pairs[idx] = sub;
      } else {
        pairs.push(sub);
      }

      const state: WorkspaceState = { user_id: userId, pairs, updated_at: Date.now() };
      await this.redisService.set(this.key(userId), JSON.stringify(state), WORKSPACE_TTL_SEC);
    } catch (err) {
      this.logger.warn(
        `upsertPairSubscription error for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Remove a pair from the user's workspace on explicit unsubscribe.
   */
  async removePairSubscription(userId: string, pairId: string): Promise<void> {
    try {
      const existing = await this.getWorkspace(userId);
      if (!existing) return;
      const pairs = existing.pairs.filter((p) => p.pair_id !== pairId);
      const state: WorkspaceState = { ...existing, pairs, updated_at: Date.now() };
      await this.redisService.set(this.key(userId), JSON.stringify(state), WORKSPACE_TTL_SEC);
    } catch (err) {
      this.logger.warn(
        `removePairSubscription error for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Delete the workspace entirely (e.g., explicit logout).
   */
  async deleteWorkspace(userId: string): Promise<void> {
    try {
      await this.redisService.del(this.key(userId));
    } catch (err) {
      this.logger.warn(
        `deleteWorkspace error for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
