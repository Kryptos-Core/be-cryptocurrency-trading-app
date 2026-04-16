import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequireFinanceAccess, RequirePermissions } from '@/common/decorators';
import { Permission } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { GetExchangeRateQuery } from './application/queries';
import { SyncExchangeRateUseCase, UpdateExchangeRateConfigUseCase } from './application/use-cases';
import { MarketPricesDto } from './dto/market-prices.dto';
import { RatePreviewDto } from './dto/rate-preview.dto';
import { SyncRateDto } from './dto/sync-rate.dto';
import { UpdateFxRateDto } from './dto/update-fx-rate.dto';

@ApiTags('Exchange Rates')
@Controller('exchange-rates')
export class ExchangeRateController {
  constructor(
    private readonly getExchangeRateQuery: GetExchangeRateQuery,
    private readonly syncExchangeRateUseCase: SyncExchangeRateUseCase,
    private readonly updateExchangeRateConfigUseCase: UpdateExchangeRateConfigUseCase,
  ) {}

  @Get('market-prices')
  @ApiOperation({ summary: 'Public market prices from CoinGecko' })
  getMarketPrices(@Query() query: MarketPricesDto) {
    return this.getExchangeRateQuery.getMarketPrices(query);
  }

  @Get('deposit-preview')
  @ApiOperation({ summary: 'Preview VND to USDT conversion before fiat deposit' })
  getDepositPreview(@Query() query: RatePreviewDto) {
    return this.getExchangeRateQuery.getDepositPreview(query);
  }

  @Get('admin/current-config')
  @UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Finance manager current FX config overview' })
  getAdminCurrentConfig() {
    return this.getExchangeRateQuery.getAdminCurrentConfig();
  }

  @Post('admin/sync')
  @UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync USDT/VND rate from external source' })
  syncAdminConfig(@Body() dto: SyncRateDto, @CurrentUser('userId') userId: string) {
    return this.syncExchangeRateUseCase.execute(dto, { userId });
  }

  @Patch('admin/config')
  @UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update FX configuration for PayOS fiat deposits' })
  updateAdminConfig(@Body() dto: UpdateFxRateDto, @CurrentUser('userId') userId: string) {
    return this.updateExchangeRateConfigUseCase.execute(dto, { userId });
  }
}
