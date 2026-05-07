import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { newUuid } from '@/common/utils/uuid.util';
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
  data: Record<string, unknown> | null;
  notification_created_at: Date;
}

type QueryRow = Record<string, unknown>;

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
    data: Record<string, unknown> | null;
  }): Promise<Notification | null> {
    const rows = await this.dataSource.query(
      `INSERT INTO notifications (notification_id, title, body, type, created_by, data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       RETURNING notification_id, title, body, type, created_by, data, created_at`,
      [
        params.notificationId,
        params.title,
        params.body,
        params.type,
        params.createdBy,
        params.data ? JSON.stringify(params.data) : null,
      ],
    );
    return (rows?.[0] as Notification | undefined) ?? null;
  }

  async findByUser(userId: string, limit: number, offset: number): Promise<NotificationRow[]> {
    const rows = await this.dataSource.query(
      `SELECT un.id, un.user_id, un.notification_id,
              CASE WHEN un.is_read = 1 THEN 1 ELSE 0 END AS is_read,
              un.read_at, un.created_at,
              n.title, n.body, n.type, n.created_by, n.data,
              n.created_at AS notification_created_at
       FROM user_notifications un
       INNER JOIN notifications n ON n.notification_id = un.notification_id
       WHERE un.user_id = $1
       ORDER BY un.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return (rows ?? []).map((row: QueryRow) => ({
      id: String(row.id ?? ''),
      user_id: String(row.user_id ?? ''),
      notification_id: String(row.notification_id ?? ''),
      is_read: Number(row.is_read ?? 0),
      read_at: (row.read_at as Date | null | undefined) ?? null,
      created_at: row.created_at as Date,
      title: String(row.title ?? ''),
      body: String(row.body ?? ''),
      type: String(row.type ?? ''),
      created_by: String(row.created_by ?? ''),
      data: (row.data as Record<string, unknown> | null | undefined) ?? null,
      notification_created_at: row.notification_created_at as Date,
    }));
  }

  async countUnread(userId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM user_notifications
       WHERE user_id = $1 AND is_read = 0`,
      [userId],
    );
    return Number(rows?.[0]?.unread_count ?? 0);
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE user_notifications
       SET is_read = 1,
           read_at = COALESCE(read_at, NOW())
       WHERE notification_id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
  }

  async markAllRead(userId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE user_notifications
       SET is_read = 1,
           read_at = COALESCE(read_at, NOW())
       WHERE user_id = $1 AND is_read = 0`,
      [userId],
    );
  }

  async findAllFcmTokens(): Promise<string[]> {
    const result = await this.dataSource.query(
      `SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL AND status = 'ACTIVE'`,
    );
    return (result as { fcm_token: string }[]).map((r) => r.fcm_token).filter(Boolean);
  }

  async getFcmTokenByUserId(userId: string): Promise<string | null> {
    const result = await this.dataSource.query(
      `SELECT fcm_token FROM users WHERE user_id = $1 AND fcm_token IS NOT NULL AND status = 'ACTIVE' LIMIT 1`,
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
    await this.dataSource.transaction(async (em) => {
      await this.insertNotification(em, params);
      await this.insertUserNotification(em, params.notificationId, params.targetUserId);
    });
  }

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
    await this.insertNotification(em, params, true);
    await this.insertUserNotification(em, params.notificationId, params.targetUserId, true);
  }

  private async insertNotification(
    em: EntityManager,
    params: {
      notificationId: string;
      title: string;
      body: string;
      type: string;
      createdBy: string;
      data: Record<string, unknown> | null;
    },
    idempotent: boolean = false,
  ): Promise<void> {
    const conflict = idempotent ? ' ON CONFLICT (notification_id) DO NOTHING' : '';
    await em.query(
      `INSERT INTO notifications (notification_id, title, body, type, created_by, data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())${conflict}`,
      [
        params.notificationId,
        params.title,
        params.body,
        params.type,
        params.createdBy,
        params.data ? JSON.stringify(params.data) : null,
      ],
    );
  }

  private async insertUserNotification(
    em: EntityManager,
    notificationId: string,
    targetUserId: string,
    idempotent: boolean = false,
  ): Promise<void> {
    const conflict = idempotent ? ' ON CONFLICT DO NOTHING' : '';
    await em.query(
      `INSERT INTO user_notifications (id, user_id, notification_id, is_read, created_at)
       VALUES ($1, $2, $3, false, NOW())${conflict}`,
      [newUuid(), targetUserId, notificationId],
    );
  }
}
