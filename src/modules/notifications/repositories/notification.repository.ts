import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { NOTIFICATION_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { BaseRepository } from '@/common/repositories';
import { Notification } from '@/entities/notification.entity';

export interface NotificationRow {
  id: string;
  user_id: string;
  notification_id: string;
  is_read: number;
  read_at: Date | null;
  created_at: Date;
  title: string;
  body: string;
  type: string;
  created_by: string;
  data: Record<string, any> | null;
  notification_created_at: Date;
}

/**
 * Notification Repository
 * Repository Pattern + Database Procedure Pattern: all reads/writes via sp_notification_*.
 */
@Injectable()
export class NotificationRepository extends BaseRepository<Notification> {
  constructor(dataSource: DataSource) {
    super(Notification, dataSource);
  }

  async createViaProcedure(params: {
    notificationId: string;
    title: string;
    body: string;
    type: string;
    createdBy: string;
    data: Record<string, any> | null;
  }): Promise<Notification | null> {
    const result = await this.dataSource.query(
      `CALL ${NOTIFICATION_STORE_PROCEDURE.CREATE}(?, ?, ?, ?, ?, ?)`,
      [
        params.notificationId,
        params.title,
        params.body,
        params.type,
        params.createdBy,
        params.data ? JSON.stringify(params.data) : null,
      ],
    );
    return result?.[0]?.[0] ?? null;
  }

  async findByUser(userId: string, limit: number, offset: number): Promise<NotificationRow[]> {
    const result = await this.dataSource.query(
      `CALL ${NOTIFICATION_STORE_PROCEDURE.FIND_BY_USER}(?, ?, ?)`,
      [userId, limit, offset],
    );
    return result?.[0] ?? [];
  }

  async countUnread(userId: string): Promise<number> {
    const result = await this.dataSource.query(
      `CALL ${NOTIFICATION_STORE_PROCEDURE.COUNT_UNREAD}(?)`,
      [userId],
    );
    return Number(result?.[0]?.[0]?.unread_count ?? 0);
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await this.dataSource.query(`CALL ${NOTIFICATION_STORE_PROCEDURE.MARK_READ}(?, ?)`, [
      notificationId,
      userId,
    ]);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.dataSource.query(`CALL ${NOTIFICATION_STORE_PROCEDURE.MARK_ALL_READ}(?)`, [userId]);
  }

  async findAllFcmTokens(): Promise<string[]> {
    const result = await this.dataSource.query(
      `SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL AND status = 'ACTIVE'`,
    );
    return (result as { fcm_token: string }[]).map((r) => r.fcm_token).filter(Boolean);
  }

  async getFcmTokenByUserId(userId: string): Promise<string | null> {
    const result = await this.dataSource.query(
      `SELECT fcm_token FROM users WHERE user_id = ? AND fcm_token IS NOT NULL AND status = 'ACTIVE' LIMIT 1`,
      [userId],
    );
    const token = (result as { fcm_token: string }[])?.[0]?.fcm_token;
    return token?.trim() || null;
  }

  async createForUser(params: {
    notificationId: string;
    title: string;
    body: string;
    type: string;
    createdBy: string;
    targetUserId: string;
    data: Record<string, unknown> | null;
  }): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO notifications (notification_id, title, body, type, created_by, data)
         VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.notificationId,
        params.title,
        params.body,
        params.type,
        params.createdBy,
        params.data ? JSON.stringify(params.data) : null,
      ],
    );
    await this.dataSource.query(
      `INSERT INTO user_notifications (id, user_id, notification_id)
         VALUES (UUID(), ?, ?)`,
      [params.targetUserId, params.notificationId],
    );
  }

  /**
   * Same as createForUser but uses the caller's EntityManager (same DB transaction as outbox relay).
   * Idempotent: duplicate PRIMARY KEY on notifications.notification_id is ignored (MySQL errno 1062).
   */
  async createForUserWithManagerIdempotent(
    em: EntityManager,
    params: {
      notificationId: string;
      title: string;
      body: string;
      type: string;
      createdBy: string;
      targetUserId: string;
      data: Record<string, unknown> | null;
    },
  ): Promise<void> {
    try {
      await em.query(
        `INSERT INTO notifications (notification_id, title, body, type, created_by, data)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          params.notificationId,
          params.title,
          params.body,
          params.type,
          params.createdBy,
          params.data ? JSON.stringify(params.data) : null,
        ],
      );
    } catch (e: any) {
      if (e?.errno === 1062 || e?.code === 'ER_DUP_ENTRY') {
        return;
      }
      throw e;
    }

    try {
      await em.query(
        `INSERT INTO user_notifications (id, user_id, notification_id)
         VALUES (UUID(), ?, ?)`,
        [params.targetUserId, params.notificationId],
      );
    } catch (e: any) {
      if (e?.errno === 1062 || e?.code === 'ER_DUP_ENTRY') {
        return;
      }
      throw e;
    }
  }
}
