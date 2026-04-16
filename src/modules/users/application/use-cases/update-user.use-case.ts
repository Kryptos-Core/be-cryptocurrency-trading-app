import { Injectable } from '@nestjs/common';
import type { UpdateUserDto } from '../../dto';
import { UsersService } from '../../users.service';

/**
 * UpdateUserUseCase — delegates to UsersService (thin adapter).
 */
@Injectable()
export class UpdateUserUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(userId: string, dto: UpdateUserDto) {
    return this.usersService.update(userId, dto);
  }
}
