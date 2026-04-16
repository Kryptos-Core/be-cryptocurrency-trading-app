import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FcmService } from '@/common/services/fcm.service';
import { Notification } from '@/entities/notification.entity';
import { UserNotification } from '@/entities/user-notification.entity';
import { AuthModule } from '@/modules/auth/auth.module';
import { GetNotificationsQuery } from './application/queries/get-notifications.query';
import { BroadcastNotificationUseCase } from './application/use-cases/broadcast-notification.use-case';
import { MarkAllNotificationsReadUseCase } from './application/use-cases/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from './application/use-cases/mark-notification-read.use-case';
import { SendNotificationUseCase } from './application/use-cases/send-notification.use-case';
import { NOTIFICATION_REPOSITORY } from './domain/ports';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationRepository } from './repositories/notification.repository';
import {
  InAppNotificationStrategy,
  NOTIFICATION_STRATEGIES,
  PushNotificationStrategy,
} from './strategies/notification.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, UserNotification]),
    forwardRef(() => AuthModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationRepository,
    {
      provide: NOTIFICATION_REPOSITORY,
      useExisting: NotificationRepository,
    },
    NotificationsService,
    NotificationsGateway,
    FcmService,
    InAppNotificationStrategy,
    PushNotificationStrategy,
    {
      provide: NOTIFICATION_STRATEGIES,
      useFactory: (inApp: InAppNotificationStrategy, push: PushNotificationStrategy) => [
        inApp,
        push,
      ],
      inject: [InAppNotificationStrategy, PushNotificationStrategy],
    },
    GetNotificationsQuery,
    BroadcastNotificationUseCase,
    MarkNotificationReadUseCase,
    MarkAllNotificationsReadUseCase,
    SendNotificationUseCase,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
