import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '@/common/services/redis.service';
import { FcmService } from '@/common/services/fcm.service';
import { NotificationRepository } from './repositories/notification.repository';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';

export const NOTIFICATIONS_CHANNEL = 'notifications:broadcast';
export const NOTIFICATIONS_TARGETED_CHANNEL = 'notifications:targeted';

/**
 * Notification Service
 * Observer Pattern: publish to Redis channel → NotificationsGateway broadcasts to all connected sockets.
 * Facade Pattern: orchestrates DB write + Redis publish + FCM push in one call.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationRepo: NotificationRepository,
    private readonly redisService: RedisService,
    private readonly fcmService: FcmService,
  ) {}

  /**
   * Send notification to a specific user (withdrawal status, etc.)
   */
  async sendToUser(
    targetUserId: string,
    dto: CreateNotificationDto,
    actorUserId: string,
  ): Promise<void> {
    const notificationId = uuidv4();

    await this.notificationRepo.createForUser({
      notificationId,
      title: dto.title,
      body: dto.body,
      type: dto.type ?? 'system',
      createdBy: actorUserId,
      targetUserId,
      data: dto.data ?? null,
    });

    const payload = {
      targetUserId,
      notification_id: notificationId,
      title: dto.title,
      body: dto.body,
      type: dto.type ?? 'system',
      data: dto.data ?? null,
      created_at: new Date().toISOString(),
    };

    await this.redisService.publish(
      NOTIFICATIONS_TARGETED_CHANNEL,
      JSON.stringify(payload),
    );

    try {
      const token = await this.notificationRepo.getFcmTokenByUserId(targetUserId);
      if (token) {
        await this.fcmService.sendToTokens([token], dto.title, dto.body, {
          notification_id: notificationId,
          type: dto.type ?? 'system',
          ...dto.data,
        });
      }
    } catch (error) {
      this.logger.error('FCM push to user failed (non-critical)', error);
    }
  }

  async broadcast(dto: CreateNotificationDto, adminId: string) {
    const notificationId = uuidv4();

    const notification = await this.notificationRepo.createViaProcedure({
      notificationId,
      title: dto.title,
      body: dto.body,
      type: dto.type ?? 'system',
      createdBy: adminId,
      data: dto.data ?? null,
    });

    const payload = {
      notification_id: notificationId,
      title: dto.title,
      body: dto.body,
      type: dto.type ?? 'system',
      data: dto.data ?? null,
      created_at: new Date().toISOString(),
    };

    // Publish to Redis — NotificationsGateway will fan-out to all connected WS clients
    await this.redisService.publish(NOTIFICATIONS_CHANNEL, JSON.stringify(payload));

    // FCM push — fire and forget for offline mobile devices
    try {
      const tokens = await this.notificationRepo.findAllFcmTokens();
      await this.fcmService.sendToTokens(tokens, dto.title, dto.body, {
        notification_id: notificationId,
        type: dto.type ?? 'system',
      });
    } catch (error) {
      this.logger.error('FCM push failed (non-critical)', error);
    }

    return notification;
  }

  async findByUser(userId: string, query: NotificationQueryDto) {
    const limit = query.limit ?? 20;
    const offset = ((query.page ?? 1) - 1) * limit;
    return this.notificationRepo.findByUser(userId, limit, offset);
  }

  async countUnread(userId: string) {
    const count = await this.notificationRepo.countUnread(userId);
    return { unread_count: count };
  }

  async markRead(notificationId: string, userId: string) {
    await this.notificationRepo.markRead(notificationId, userId);
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.notificationRepo.markAllRead(userId);
    return { success: true };
  }
}
