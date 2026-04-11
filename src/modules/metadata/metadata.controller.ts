import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RoleGuard } from '@/common/guards';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { UserRole } from '@/common/enums';
import { buildAdminEnumsPayload } from './admin-enums.builder';

@ApiTags('Metadata')
@Controller()
export class MetadataController {
  @Get('enums')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @RequireRoles(
    UserRole.ADMIN,
    UserRole.RISK_OFFICER,
    UserRole.SUPPORT_AGENT,
    UserRole.FINANCE_MANAGER,
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reference enum values for admin filters',
    description:
      'Machine values for orders, deposits, withdrawals, users, treasury. UI labels come from client l10n. Ops roles only (not TRADER / MARKET_MAKER).',
  })
  getAdminEnums() {
    return buildAdminEnumsPayload();
  }
}
