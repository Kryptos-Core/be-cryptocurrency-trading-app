import { Injectable } from '@nestjs/common';
import type { RequestSecurityChangeDto } from '../../dto';
import { UsersService } from '../../users.service';

/**
 * RequestSecurityChangeUseCase — delegates to UsersService (thin adapter).
 */
@Injectable()
export class RequestSecurityChangeUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(userId: string, dto: RequestSecurityChangeDto) {
    return this.usersService.requestSecurityChange(userId, dto);
  }
}
