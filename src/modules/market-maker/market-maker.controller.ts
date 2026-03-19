import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, RequireRoles } from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { MarketMakerService } from './market-maker.service';
import { PlaceMakerOrdersDto, RefreshMakerOrdersDto, UpsertMarketMakerConfigDto } from './dto';

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

  @Get('config/:pairId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.MARKET_MAKER, UserRole.ADMIN)
  @RequirePermissions(Permission.MARKET_MAKER_CONFIG)
  @ApiOperation({ summary: 'Get market maker config by pair' })
  getConfigByPair(
    @CurrentUser('userId') userId: string,
    @Param('pairId') pairId: string,
  ) {
    return this.marketMakerService.getConfigByPair(userId, pairId);
  }

  @Put('config/:pairId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.MARKET_MAKER, UserRole.ADMIN)
  @RequirePermissions(Permission.MARKET_MAKER_CONFIG)
  @ApiOperation({ summary: 'Create or update market maker config by pair' })
  upsertConfig(
    @CurrentUser('userId') userId: string,
    @Param('pairId') pairId: string,
    @Body() dto: UpsertMarketMakerConfigDto,
  ) {
    return this.marketMakerService.upsertConfig(userId, pairId, dto);
  }

  @Delete('config/:pairId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.MARKET_MAKER, UserRole.ADMIN)
  @RequirePermissions(Permission.MARKET_MAKER_CONFIG)
  @ApiOperation({ summary: 'Delete market maker config by pair' })
  deleteConfig(
    @CurrentUser('userId') userId: string,
    @Param('pairId') pairId: string,
  ) {
    return this.marketMakerService.deleteConfig(userId, pairId);
  }

  @Post('place/:pairId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.MARKET_MAKER, UserRole.ADMIN)
  @RequirePermissions(Permission.ORDERS_BATCH_PLACE)
  @ApiOperation({ summary: 'Place two-sided maker orders around Redis mid price (alias of refresh)' })
  placeMakerOrders(
    @CurrentUser('userId') userId: string,
    @Param('pairId') pairId: string,
    @Body() dto: PlaceMakerOrdersDto,
  ) {
    return this.marketMakerService.refreshMakerOrders(
      userId,
      pairId,
      undefined,
      dto.order_amount_override,
    );
  }

  @Post('refresh/:pairId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.MARKET_MAKER, UserRole.ADMIN)
  @RequirePermissions(Permission.ORDERS_BATCH_PLACE)
  @ApiOperation({ summary: 'Cancel open maker orders and re-place two-sided maker orders' })
  refreshMakerOrders(
    @CurrentUser('userId') userId: string,
    @Param('pairId') pairId: string,
    @Body() dto: RefreshMakerOrdersDto,
  ) {
    return this.marketMakerService.refreshMakerOrders(
      userId,
      pairId,
      dto.refresh_cycle_key,
      dto.order_amount_override,
    );
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
