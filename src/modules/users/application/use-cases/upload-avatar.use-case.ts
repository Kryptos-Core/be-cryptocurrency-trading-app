import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users.service';

/**
 * UploadAvatarUseCase — delegates to UsersService (thin adapter).
 */
@Injectable()
export class UploadAvatarUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(userId: string, buffer: Buffer) {
    return this.usersService.uploadAvatar(userId, buffer);
  }
}
