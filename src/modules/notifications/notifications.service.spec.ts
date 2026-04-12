import { Test, type TestingModule } from '@nestjs/testing';
import type { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsService } from './notifications.service';
import { NotificationRepository } from './repositories/notification.repository';
import {
  type INotificationStrategy,
  NOTIFICATION_STRATEGIES,
} from './strategies/notification.strategy';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepo: jest.Mocked<
    Pick<NotificationRepository, 'createForUser' | 'getFcmTokenByUserId'>
  >;
  let strategy: jest.Mocked<INotificationStrategy>;

  const dto: CreateNotificationDto = {
    title: 'System update',
    body: 'The system is processing your request.',
    type: 'system',
    data: { source: 'unit-test' },
  };

  beforeEach(async () => {
    notificationRepo = {
      createForUser: jest.fn().mockResolvedValue(undefined),
      getFcmTokenByUserId: jest.fn().mockResolvedValue('fcm-token-1'),
    };

    strategy = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
      broadcast: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationRepository, useValue: notificationRepo },
        { provide: NOTIFICATION_STRATEGIES, useValue: [strategy] },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('passes resolved FCM token to strategies when token lookup succeeds', async () => {
    await expect(service.sendToUser('user-1', dto, 'admin-1')).resolves.toBeUndefined();

    expect(notificationRepo.createForUser).toHaveBeenCalledWith({
      notificationId: expect.any(String),
      title: dto.title,
      body: dto.body,
      type: dto.type,
      createdBy: 'admin-1',
      targetUserId: 'user-1',
      data: dto.data,
    });

    expect(strategy.sendToUser).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      dto,
      'fcm-token-1',
    );
  });

  it('falls back to undefined token when token lookup fails and still sends notifications', async () => {
    notificationRepo.getFcmTokenByUserId.mockRejectedValueOnce(new Error('token lookup failed'));

    await expect(service.sendToUser('user-1', dto, 'admin-1')).resolves.toBeUndefined();

    expect(notificationRepo.createForUser).toHaveBeenCalledTimes(1);
    expect(strategy.sendToUser).toHaveBeenCalledWith('user-1', expect.any(String), dto, undefined);
  });
});
