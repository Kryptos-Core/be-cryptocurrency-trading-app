import { Injectable } from '@nestjs/common';
import type { ReviewSecurityChangeDto } from '../../dto';
import { UsersService } from '../../users.service';

/**
 * ReviewSecurityChangeUseCase — delegates to UsersService (thin adapter).
 */
@Injectable()
export class ReviewSecurityChangeUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(requestId: string, reviewerUserId: string, dto: ReviewSecurityChangeDto) {
    return this.usersService.reviewSecurityChangeRequest(requestId, reviewerUserId, dto);
  }
}
