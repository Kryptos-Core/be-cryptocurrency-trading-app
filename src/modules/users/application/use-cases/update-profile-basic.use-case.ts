import { Injectable } from '@nestjs/common';
import type { UpdateMyProfileBasicDto } from '../../dto';
import { UsersService } from '../../users.service';

/**
 * UpdateProfileBasicUseCase — delegates to UsersService (thin adapter).
 */
@Injectable()
export class UpdateProfileBasicUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(userId: string, dto: UpdateMyProfileBasicDto) {
    return this.usersService.updateProfileBasic(userId, dto);
  }
}
