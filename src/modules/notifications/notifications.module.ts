import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '@/entities/notification.entity';
import { UserNotification } from '@/entities/user-notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationRepository } from './repositories/notification.repository';
import { FcmService } from '@/common/services/fcm.service';
import { AuthModule } from '@/modules/auth/auth.module';

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
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, NotificationRepository, FcmService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
