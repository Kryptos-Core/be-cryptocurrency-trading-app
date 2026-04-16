import { Injectable } from '@nestjs/common';
import { NotificationsService } from '../../notifications.service';

/**
 * MarkNotificationReadUseCase — delegates to NotificationsService (thin adapter).
 */
@Injectable()
export class MarkNotificationReadUseCase {
  constructor(private readonly notificationsService: NotificationsService) {}

  async execute(notificationId: string, userId: string) {
    return this.notificationsService.markRead(notificationId, userId);
  }
}
