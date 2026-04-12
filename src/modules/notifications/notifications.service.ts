import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { calcSkip } from '@/common/utils/pagination.util';
import type { CreateNotificationDto } from './dto/create-notification.dto';
import type { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationRepository } from './repositories/notification.repository';
import {
  type INotificationStrategy,
  NOTIFICATION_STRATEGIES,
} from './strategies/notification.strategy';

export const NOTIFICATIONS_CHANNEL = 'notifications:broadcast';
export const NOTIFICATIONS_TARGETED_CHANNEL = 'notifications:targeted';

/**
 * Notification Service
 * Strategy Pattern: Injects an array of strategies (InApp, Push) and executes them.
 * Facade Pattern: orchestrates DB write + Strategy executions.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationRepo: NotificationRepository,
    @Inject(NOTIFICATION_STRATEGIES) private readonly strategies: INotificationStrategy[],
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

    const token = await this.notificationRepo.getFcmTokenByUserId(targetUserId);

    // Execute all registered strategies (Strategy Pattern)
    await Promise.all(
      this.strategies.map((strategy) =>
        strategy.sendToUser(targetUserId, notificationId, dto, token ?? undefined),
      ),
    );
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

    const tokens = await this.notificationRepo.findAllFcmTokens();

    // Execute all registered strategies (Strategy Pattern)
    await Promise.all(
      this.strategies.map((strategy) => strategy.broadcast(notificationId, dto, tokens)),
    );

    return notification;
  }

  async findByUser(userId: string, query: NotificationQueryDto) {
    const limit = query.limit ?? 20;
    const offset = calcSkip(query.page ?? 1, limit);
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
