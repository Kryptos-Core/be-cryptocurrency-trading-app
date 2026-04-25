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
import { RequirePermissions, RequireRoles } from '@/common/decorators';
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
    description: 'Clears dead-letter and retry metadata so the relay can retry publishing the row.',
  })
  async requeueDeadLetter(@Param('id') id: string) {
    return this.outboxAdminService.requeueDeadLetterRow(id);
  }

  @Post('dead-letter/requeue')
  @ApiOperation({
    summary: 'Bulk requeue dead-lettered outbox rows',
    description: 'Requeues a bounded number of dead-letter rows in newest-first order.',
  })
  async requeueDeadLetters(
    @Body('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.outboxAdminService.requeueAllDeadLetterRows(limit);
  }

  @Get('relay-health')
  @ApiOperation({
    summary: 'Outbox relay operational health',
    description: 'Returns backlog, retry and dead-letter counts for integration outbox relay.',
  })
  async relayHealth() {
    return this.outboxAdminService.getRelayHealth();
  }
}
