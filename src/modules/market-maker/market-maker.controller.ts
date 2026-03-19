import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, RequireRoles } from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { MarketMakerService } from './market-maker.service';

@ApiTags('market-maker')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('market-maker')
export class MarketMakerController {
  constructor(private readonly marketMakerService: MarketMakerService) {}

  @Get('config')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.MARKET_MAKER, UserRole.ADMIN)
  @RequirePermissions(Permission.MARKET_MAKER_CONFIG)
  @ApiOperation({ summary: 'List market maker configs for current user' })
  getConfig(@CurrentUser('userId') userId: string) {
    return this.marketMakerService.getConfigList(userId);
  }

  @Get('dashboard')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.MARKET_MAKER, UserRole.ADMIN)
  @RequirePermissions(Permission.MARKET_MAKER_DASHBOARD)
  @ApiOperation({ summary: 'Get market maker dashboard summary' })
  getDashboard(@CurrentUser('userId') userId: string) {
    return this.marketMakerService.getDashboard(userId);
  }
}
