import { Injectable } from '@nestjs/common';
import { NotificationsService } from '../../notifications.service';

/**
 * MarkAllNotificationsReadUseCase — delegates to NotificationsService (thin adapter).
 */
@Injectable()
export class MarkAllNotificationsReadUseCase {
  constructor(private readonly notificationsService: NotificationsService) {}

  async execute(userId: string) {
    return this.notificationsService.markAllRead(userId);
  }
}
