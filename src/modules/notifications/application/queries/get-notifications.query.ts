import { Injectable } from '@nestjs/common';
import type { NotificationQueryDto } from '../../dto/notification-query.dto';
import { NotificationsService } from '../../notifications.service';

/**
 * GetNotificationsQuery — read-only queries for notification data.
 *
 * Thin wrapper around NotificationsService following CQS principle.
 */
@Injectable()
export class GetNotificationsQuery {
  constructor(private readonly notificationsService: NotificationsService) {}

  async findByUser(userId: string, query: NotificationQueryDto) {
    return this.notificationsService.findByUser(userId, query);
  }

  async countUnread(userId: string) {
    return this.notificationsService.countUnread(userId);
  }
}
