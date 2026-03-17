import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
    try {
      const result = await this.dataSource.query(
        'CALL sp_notification_create(?, ?, ?, ?, ?, ?)',
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
    } catch (error) {
      this.logger.error('Error creating notification via procedure', error);
      throw error;
    }
  }

  async findByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<NotificationRow[]> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_notification_find_by_user(?, ?, ?)',
        [userId, limit, offset],
      );
      return result?.[0] ?? [];
    } catch (error) {
      this.logger.error(`Error finding notifications by user: ${userId}`, error);
      throw error;
    }
  }

  async countUnread(userId: string): Promise<number> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_notification_count_unread(?)',
        [userId],
      );
      return Number(result?.[0]?.[0]?.unread_count ?? 0);
    } catch (error) {
      this.logger.error(`Error counting unread notifications for user: ${userId}`, error);
      throw error;
    }
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    try {
      await this.dataSource.query(
        'CALL sp_notification_mark_read(?, ?)',
        [notificationId, userId],
      );
    } catch (error) {
      this.logger.error(
        `Error marking notification read: notif=${notificationId}, user=${userId}`,
        error,
      );
      throw error;
    }
  }

  async markAllRead(userId: string): Promise<void> {
    try {
      await this.dataSource.query('CALL sp_notification_mark_all_read(?)', [userId]);
    } catch (error) {
      this.logger.error(`Error marking all notifications read for user: ${userId}`, error);
      throw error;
    }
  }

  async findAllFcmTokens(): Promise<string[]> {
    try {
      const result = await this.dataSource.query(
        `SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL AND status = 'ACTIVE'`,
      );
      return (result as { fcm_token: string }[]).map((r) => r.fcm_token).filter(Boolean);
    } catch (error) {
      this.logger.error('Error fetching FCM tokens', error);
      throw error;
    }
  }
}
