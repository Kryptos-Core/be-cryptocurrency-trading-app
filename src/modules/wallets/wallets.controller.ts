import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
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
import { AdminAdjustWalletDto } from './dto/admin-adjust-wallet.dto';

/**
 * Wallets Controller
 * API endpoints for wallet operations.
 * List/balance/ledger endpoints: available to ALL authenticated roles (no RoleGuard).
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
   * Available to ALL authenticated roles (trader, admin, support, risk, finance, market maker).
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

  /**
   * Điều chỉnh số dư ví thủ công cho người dùng bất kỳ.
   * POST /wallets/admin/adjust
   * Yêu cầu quyền WALLETS_MANAGE (ADMIN, RISK_OFFICER hoặc FINANCE_MANAGER).
   */
  @Post('admin/adjust')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({
    summary: 'Điều chỉnh số dư ví thủ công',
    description:
      'Admin / Risk / Finance Manager nạp hoặc rút số dư ảo vào ví người dùng. Tạo bản ghi audit đầy đủ.',
  })
  @ApiSuccessResponse('Điều chỉnh số dư thành công')
  @ApiBadRequestResponse('Dữ liệu không hợp lệ hoặc số dư không đủ')
  @ApiUnauthorizedResponse('Unauthorized')
  async adminAdjustWallet(
    @CurrentUser('userId') actorUserId: string,
    @Body() dto: AdminAdjustWalletDto,
  ) {
    return this.walletsService.adminAdjustBalance(actorUserId, dto);
  }

  /**
   * Lịch sử điều chỉnh số dư thủ công theo người dùng.
   * GET /wallets/admin/adjustments/:userId
   * Yêu cầu quyền WALLETS_MANAGE (ADMIN, RISK_OFFICER hoặc FINANCE_MANAGER).
   */
  @Get('admin/adjustments/:userId')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({
    summary: 'Lịch sử điều chỉnh ví của người dùng',
    description: 'Xem toàn bộ lịch sử nạp/rút thủ công cho một người dùng (có phân trang).',
  })
  @ApiParam({ name: 'userId', description: 'UUID của người dùng', type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiSuccessResponse('Lịch sử điều chỉnh')
  @ApiUnauthorizedResponse('Unauthorized')
  async getAdminAdjustmentHistory(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.walletsService.getAdminAdjustmentHistory(userId, parsedLimit, parsedOffset);
  }

}
