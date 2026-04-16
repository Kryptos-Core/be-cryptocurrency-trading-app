import { Injectable } from '@nestjs/common';
import type { UserFilterDto } from '../../dto';
import { UsersService } from '../../users.service';

/**
 * GetUsersQuery — read-only queries for user data.
 *
 * Thin wrapper around UsersService following CQS principle.
 * Separates reads from writes in the application layer.
 */
@Injectable()
export class GetUsersQuery {
  constructor(private readonly usersService: UsersService) {}

  async findAll(filters: UserFilterDto) {
    return this.usersService.findAll(filters);
  }

  async findOne(userId: string) {
    return this.usersService.findOne(userId);
  }

  async getStatistics() {
    return this.usersService.getStatistics();
  }

  async getPendingSecurityChangeRequests() {
    return this.usersService.getPendingSecurityChangeRequests();
  }

  async getUserWallets(userId: string) {
    return this.usersService.getUserWallets(userId);
  }

  async getUserOnchainTransactions(userId: string, page: number, limit: number) {
    return this.usersService.getUserOnchainTransactions(userId, page, limit);
  }

  async getUserSecurityChanges(userId: string, page: number, limit: number) {
    return this.usersService.getUserSecurityChanges(userId, page, limit);
  }

  async getUserOrders(userId: string, page: number, limit: number, status?: string) {
    return this.usersService.getUserOrders(userId, page, limit, status);
  }
}
