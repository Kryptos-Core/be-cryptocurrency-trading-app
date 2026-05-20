import { Injectable, Logger } from '@nestjs/common';
import { FcmService } from '@/common/services/fcm.service';
import { RedisService } from '@/common/services/redis.service';
import type { CreateNotificationDto } from '../dto/create-notification.dto';
import { NOTIFICATIONS_CHANNEL, NOTIFICATIONS_TARGETED_CHANNEL } from '../notifications.service';

/**
 * Strategy Interface
 */
export interface INotificationStrategy {
  sendToUser(
    targetUserId: string,
    notificationId: string,
    dto: CreateNotificationDto,
    fcmToken?: string | null,
    tokens?: string[],
  ): Promise<void>;
  broadcast(notificationId: string, dto: CreateNotificationDto, tokens?: string[]): Promise<void>;
}

export const NOTIFICATION_STRATEGIES = 'NOTIFICATION_STRATEGIES';

/**
 * Concrete Strategy 1: In-App (Redis + WebSockets)
 */
@Injectable()
export class InAppNotificationStrategy implements INotificationStrategy {
  constructor(private readonly redisService: RedisService) {}

  async sendToUser(
    targetUserId: string,
    notificationId: string,
    dto: CreateNotificationDto,
  ): Promise<void> {
    const payload = {
      targetUserId,
      notification_id: notificationId,
      title: dto.title,
      body: dto.body,
      type: dto.type ?? 'system',
      data: dto.data ?? null,
      created_at: new Date().toISOString(),
    };
    await this.redisService.publish(NOTIFICATIONS_TARGETED_CHANNEL, JSON.stringify(payload));
  }

  async broadcast(notificationId: string, dto: CreateNotificationDto): Promise<void> {
    const payload = {
      notification_id: notificationId,
      title: dto.title,
      body: dto.body,
      type: dto.type ?? 'system',
      data: dto.data ?? null,
      created_at: new Date().toISOString(),
    };
    await this.redisService.publish(NOTIFICATIONS_CHANNEL, JSON.stringify(payload));
  }
}

/**
 * Concrete Strategy 2: Push Notifications (Firebase)
 */
@Injectable()
export class PushNotificationStrategy implements INotificationStrategy {
  private readonly logger = new Logger(PushNotificationStrategy.name);

  constructor(private readonly fcmService: FcmService) {}

  async sendToUser(
    _targetUserId: string,
    notificationId: string,
    dto: CreateNotificationDto,
    fcmToken?: string | null,
  ): Promise<void> {
    if (!fcmToken) return;
    try {
      await this.fcmService.sendToTokens(
        [fcmToken],
        dto.title,
        dto.body,
        {
          notification_id: notificationId,
          type: dto.type ?? 'system',
          ...dto.data,
        },
        dto.type,
      );
    } catch (error) {
      this.logger.error('FCM push to user failed (non-critical)', error);
    }
  }

  async broadcast(
    notificationId: string,
    dto: CreateNotificationDto,
    tokens?: string[],
  ): Promise<void> {
    if (!tokens || tokens.length === 0) return;
    try {
      await this.fcmService.sendToTokens(
        tokens,
        dto.title,
        dto.body,
        {
          notification_id: notificationId,
          type: dto.type ?? 'system',
        },
        dto.type,
      );
    } catch (error) {
      this.logger.error('FCM broadcast failed (non-critical)', error);
    }
  }
}
