import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { CurrentUser, RequirePermissions, RequireRoles } from '@/common/decorators';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';

/**
 * Wallets Controller
 * API endpoints for wallet operations
 */
@ApiTags('wallets')
@ApiBearerAuth('JWT-auth')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  /**
   * Get current user's wallets (all or exclude zero balances).
   * GET /wallets?include_zero=false
   */
  @Get()
  @ApiOperation({
    summary: 'List wallets',
    description: 'Get all wallets for the current user. Use include_zero=false to hide zero balances.',
  })
  @ApiQuery({ name: 'include_zero', required: false, type: Boolean, example: false })
  @ApiSuccessResponse('Wallet list retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async getWallets(
    @CurrentUser('userId') userId: string,
    @Query('include_zero') includeZero?: string,
  ) {
    const include = includeZero !== 'false' && includeZero !== '0';
    return this.walletsService.getWallets(userId, include);
  }

  /**
   * Get current user's wallet balance by currency
   * GET /wallets/balance?currencyId=1
   */
  @Get('balance')
  @ApiOperation({
    summary: 'Get wallet balance',
    description: 'Retrieve wallet balance for a specific currency',
  })
  @ApiQuery({ name: 'currencyId', required: true, type: String, example: '018e9a7b-1234-7abc-8000-000000000002' })
  @ApiSuccessResponse('Wallet balance retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async getBalance(
    @CurrentUser('userId') userId: string,
    @Query('currencyId') currencyId: string,
  ) {
    return this.walletsService.getBalance(userId, currencyId);
  }

  /**
   * Get transaction history (ledger) for current user and currency
   * GET /wallets/ledger?currencyId=1
   */
  @Get('ledger')
  @ApiOperation({
    summary: 'Get transaction history',
    description: 'Retrieve recent ledger entries (deposits, withdrawals) for a currency',
  })
  @ApiQuery({ name: 'currencyId', required: true, type: String, example: '018e9a7b-1234-7abc-8000-000000000002' })
  @ApiSuccessResponse('Transaction history retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async getLedger(
    @CurrentUser('userId') userId: string,
    @Query('currencyId') currencyId: string,
  ) {
    return this.walletsService.getTransactionHistory(userId, currencyId);
  }

  /**
   * Sync wallet balance with Binance exchange
   * POST /wallets/sync?currencyId=1
   */
  @Post('sync')
  @ApiOperation({
    summary: 'Sync balance with Binance',
    description: 'Fetch and sync wallet balance from Binance testnet',
  })
  @ApiQuery({ name: 'currencyId', required: true, type: String, example: '018e9a7b-1234-7abc-8000-000000000002' })
  @ApiSuccessResponse('Balance synced successfully')
  @ApiBadRequestResponse('Sync failed')
  @ApiUnauthorizedResponse('Unauthorized')
  async syncBalanceWithExchange(
    @CurrentUser('userId') userId: string,
    @Query('currencyId') currencyId: string,
  ) {
    return this.walletsService.syncBalanceWithExchange(userId, currencyId);
  }

  /**
   * Get exchange balance
   * GET /wallets/exchange-balance?currencyId=1
   */
  @Get('exchange-balance')
  @ApiOperation({
    summary: 'Get exchange balance',
    description: 'Get current balance directly from Binance exchange',
  })
  @ApiQuery({ name: 'currencyId', required: true, type: String, example: '018e9a7b-1234-7abc-8000-000000000002' })
  @ApiSuccessResponse('Exchange balance retrieved successfully')
  @ApiBadRequestResponse('Failed to get balance from exchange')
  @ApiUnauthorizedResponse('Unauthorized')
  async getExchangeBalance(
    @CurrentUser('userId') userId: string,
    @Query('currencyId') currencyId: string,
  ) {
    return this.walletsService.syncBalanceWithExchange(userId, currencyId);
  }

  /**
   * Get reconciliation status
   * GET /wallets/reconciliation-status
   */
  @Get('reconciliation-status')
  @ApiOperation({
    summary: 'Check reconciliation status',
    description: 'Check balance discrepancy between internal wallet and Binance',
  })
  @ApiQuery({ name: 'currencyId', required: true, type: String, example: '018e9a7b-1234-7abc-8000-000000000002' })
  @ApiSuccessResponse('Reconciliation status retrieved')
  @ApiBadRequestResponse('Reconciliation check failed')
  @ApiUnauthorizedResponse('Unauthorized')
  async getReconciliationStatus(
    @CurrentUser('userId') userId: string,
    @Query('currencyId') currencyId: string,
  ) {
    return this.walletsService.reconcileBalance(userId, currencyId);
  }

  /**
   * Export reconciliation report to daily JSON file.
   * POST /wallets/reconciliation-report/export?limit=100
   */
  @Post('reconciliation-report/export')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.RISK_REVIEW)
  @ApiOperation({
    summary: 'Export daily reconciliation report',
    description:
      'Runs reconciliation batch and appends a JSON entry to reports/reconciliation/YYYY-MM-DD.json',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiSuccessResponse('Reconciliation report exported successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async exportReconciliationReport(
    @CurrentUser('userId') actorUserId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return this.walletsService.exportDailyReconciliationReport(
      actorUserId,
      parsedLimit,
    );
  }

}
