import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users.service';

/**
 * SaveFcmTokenUseCase — delegates to UsersService (thin adapter).
 */
@Injectable()
export class SaveFcmTokenUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(userId: string, fcmToken: string | null): Promise<void> {
    return this.usersService.saveFcmToken(userId, fcmToken);
  }
}
