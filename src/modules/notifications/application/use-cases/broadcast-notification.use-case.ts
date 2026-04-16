import { Injectable } from '@nestjs/common';
import type { CreateNotificationDto } from '../../dto/create-notification.dto';
import { NotificationsService } from '../../notifications.service';

/**
 * BroadcastNotificationUseCase — delegates to NotificationsService (thin adapter).
 */
@Injectable()
export class BroadcastNotificationUseCase {
  constructor(private readonly notificationsService: NotificationsService) {}

  async execute(dto: CreateNotificationDto, adminId: string) {
    return this.notificationsService.broadcast(dto, adminId);
  }
}
