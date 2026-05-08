import { Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DataSource } from 'typeorm';
import { BlockchainNetwork } from '@/common/enums';
import { DepositWatcherCursor } from '@/entities/deposit-watcher-cursor.entity';

class ResetCursorQuery {
  @IsEnum(BlockchainNetwork)
  chain!: BlockchainNetwork;

  @IsOptional()
  @IsString()
  secret?: string;
}

/**
 * Admin endpoints for deposit watcher management.
 * Should be protected in production (e.g., via guard or network restriction).
 * POST /api/v1/admin/deposit-watcher/reset-cursor?chain=TRON_NILE
 * DELETE /api/v1/admin/deposit-watcher/cursors - reset all cursors
 * GET /api/v1/admin/deposit-watcher/cursors - list all cursors
 */
@Controller('admin/deposit-watcher')
export class DepositWatcherAdminController {
  constructor(private readonly dataSource: DataSource) {}

  @Post('reset-cursor')
  async resetCursor(@Query() query: ResetCursorQuery): Promise<{ ok: true; chain: string }> {
    const repo = this.dataSource.getRepository(DepositWatcherCursor);
    await repo.delete({ chain: query.chain });
    return { ok: true, chain: query.chain };
  }

  @Delete('cursors')
  async resetAllCursors(): Promise<{ ok: true; deleted: number }> {
    const repo = this.dataSource.getRepository(DepositWatcherCursor);
    const result = await repo.delete({});
    return { ok: true, deleted: result.affected ?? 0 };
  }

  @Get('cursors')
  async listCursors(): Promise<{
    cursors: Array<{ chain: string; cursor_value: string; cursor_kind: string }>;
  }> {
    const repo = this.dataSource.getRepository(DepositWatcherCursor);
    const all = await repo.find({ order: { chain: 'ASC' } });
    return {
      cursors: all.map((c) => ({
        chain: c.chain,
        cursor_value: c.cursor_value,
        cursor_kind: c.cursor_kind,
      })),
    };
  }
}
