import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, RequireRoles } from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { OutboxAdminService } from './outbox-admin.service';

@ApiTags('outbox-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
@RequirePermissions(Permission.OUTBOX_MANAGE)
@Controller('admin/outbox')
export class OutboxAdminController {
  constructor(private readonly outboxAdminService: OutboxAdminService) {}

  @Get('dead-letter')
  @ApiOperation({
    summary: 'List dead-lettered outbox rows',
    description: 'Operational endpoint for inspecting unpublished outbox rows moved to dead-letter state.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  async listDeadLetter(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return {
      items: await this.outboxAdminService.listDeadLetterRows(limit),
    };
  }

  @Post('dead-letter/:id/requeue')
  @ApiOperation({
    summary: 'Requeue one dead-lettered outbox row',
    description:
      'Clears dead-letter and retry metadata so the relay can retry publishing the row, and writes replay audit evidence.',
  })
  async requeueDeadLetter(
    @Param('id') id: string,
    @CurrentUser('userId') actorUserId: string,
    @CurrentUser('role') actorRole: string,
    @Body('reason') reason?: string,
  ) {
    return this.outboxAdminService.requeueDeadLetterRow(id, {
      actorUserId,
      actorRole,
      reason,
    });
  }

  @Post('dead-letter/requeue')
  @ApiOperation({
    summary: 'Bulk requeue dead-lettered outbox rows',
    description:
      'Requeues a bounded number of dead-letter rows in newest-first order and writes replay audit evidence.',
  })
  async requeueDeadLetters(
    @Body('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @CurrentUser('userId') actorUserId: string,
    @CurrentUser('role') actorRole: string,
    @Body('reason') reason?: string,
  ) {
    return this.outboxAdminService.requeueAllDeadLetterRows(limit, {
      actorUserId,
      actorRole,
      reason,
    });
  }

  @Get('replay-audits')
  @ApiOperation({
    summary: 'List outbox replay audit records',
    description:
      'Returns recent audit trail for dead-letter requeue actions (who, when, reason, selected rows, requeued rows).',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async listReplayAudits(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return {
      items: await this.outboxAdminService.listReplayAudits(limit),
    };
  }

  @Get('relay-health')
  @ApiOperation({
    summary: 'Outbox relay operational health + age SLO signals',
    description: 'Returns backlog/retry/dead-letter counts, age signals, warning/critical thresholds, and computed alert severity for relay observability + automation.',
  })
  async relayHealth() {
    return this.outboxAdminService.getRelayHealth();
  }
}

