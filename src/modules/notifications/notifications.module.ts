import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FcmService } from '@/common/services/fcm.service';
import { Notification } from '@/entities/notification.entity';
import { UserNotification } from '@/entities/user-notification.entity';
import { AuthModule } from '@/modules/auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationRepository } from './repositories/notification.repository';
import {
  InAppNotificationStrategy,
  NOTIFICATION_STRATEGIES,
  PushNotificationStrategy,
} from './strategies/notification.strategy';

/**
 * Notifications Module
 * Encapsulates:
 *  - REST endpoints (NotificationsController)
 *  - WebSocket gateway (/notifications namespace, NotificationsGateway)
 *  - Business logic (NotificationsService)
 *  - Data access (NotificationRepository)
 *  - Firebase push (FcmService)
 *
 * JwtModule is re-used via AuthModule export (no duplicate registration).
 * RedisService is provided globally via RedisModule (@Global).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, UserNotification]),
    forwardRef(() => AuthModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationRepository,
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
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
