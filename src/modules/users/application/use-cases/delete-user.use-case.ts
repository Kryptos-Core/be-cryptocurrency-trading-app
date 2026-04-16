import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users.service';

/**
 * DeleteUserUseCase — delegates to UsersService (thin adapter).
 */
@Injectable()
export class DeleteUserUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(userId: string): Promise<void> {
    return this.usersService.remove(userId);
  }
}
