import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { PublicWsPayloadParityService } from './services/public-ws-payload-parity.service';

@ApiTags('trading-admin')
@ApiBearerAuth('JWT-auth')
@Controller('trading/admin')
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
export class TradingOpsController {
  constructor(private readonly payloadParityService: PublicWsPayloadParityService) {}

  @Get('public-ws-parity')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'Public WS payload parity report',
    description:
      'Returns contract compatibility health for ticker/ohlc payloads and drift summary between Go aggregator ingress payloads and emitted /trading payloads.',
  })
  getPublicWsParity() {
    return this.payloadParityService.getReport();
  }
}
