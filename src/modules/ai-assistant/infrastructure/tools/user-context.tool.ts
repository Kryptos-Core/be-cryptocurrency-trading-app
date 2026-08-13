import { Injectable, Logger } from '@nestjs/common';
import { OrdersService } from '@/modules/orders/orders.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import type { ToolContext, ToolDefinition } from '../../strategies/context-builder.strategy';

/**
 * Read-only user-scoped tools. Always scope to `userId` from the tool context.
 * No write/mutation actions are exposed.
 */
@Injectable()
export class UserContextTool {
  private readonly logger = new Logger(UserContextTool.name);

  constructor(
    private readonly walletsService: WalletsService,
    private readonly ordersService: OrdersService,
  ) {}

  definitions(): ToolDefinition[] {
    return [
      {
        name: 'get_my_wallets',
        handler: async (_args, ctx: ToolContext) => {
          try {
            const wallets = await this.walletsService.getWallets(ctx.userId, false);
            return Array.isArray(wallets)
              ? wallets.map((w) => ({
                  currency: w.symbol ?? w.currencyId,
                  available: w.available ?? '0',
                  frozen: w.frozen ?? '0',
                  total: w.total ?? w.available ?? '0',
                }))
              : [];
          } catch (err) {
            this.logger.warn(`get_my_wallets failed: ${(err as Error).message}`);
            return { error: 'Không lấy được danh sách ví' };
          }
        },
      },
      {
        name: 'get_my_open_orders',
        handler: async (_args, _ctx: ToolContext) => {
          try {
            const result = await this.ordersService.findAllForAdmin({
              userId: _ctx.userId,
              status: 'OPEN',
              page: 1,
              limit: 50,
            });
            const rows = (result as { data?: unknown[]; orders?: unknown[] })?.data ?? (result as { orders?: unknown[] })?.orders ?? [];
            return { count: rows.length, orders: rows };
          } catch (err) {
            this.logger.warn(`get_my_open_orders failed: ${(err as Error).message}`);
            return { error: 'Không lấy được lệnh đang mở' };
          }
        },
      },
      {
        name: 'get_my_recent_orders',
        handler: async (args, ctx: ToolContext) => {
          const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 50);
          try {
            const result = await this.ordersService.findOrdersByUser(ctx.userId, 1, limit);
            const rows = (result as { data?: unknown[]; orders?: unknown[] })?.data ?? (result as { orders?: unknown[] })?.orders ?? result;
            return { count: Array.isArray(rows) ? rows.length : 0, orders: rows };
          } catch (err) {
            this.logger.warn(`get_my_recent_orders failed: ${(err as Error).message}`);
            return { error: 'Không lấy được lịch sử lệnh' };
          }
        },
      },
    ];
  }
}
