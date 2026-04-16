import { Injectable } from '@nestjs/common';
import type { CreateNotificationDto } from '../../dto/create-notification.dto';
import { NotificationsService } from '../../notifications.service';

/**
 * SendNotificationUseCase — delegates to NotificationsService (thin adapter).
 */
@Injectable()
export class SendNotificationUseCase {
  constructor(private readonly notificationsService: NotificationsService) {}

  async execute(targetUserId: string, dto: CreateNotificationDto, actorUserId: string) {
    return this.notificationsService.sendToUser(targetUserId, dto, actorUserId);
  }
}
