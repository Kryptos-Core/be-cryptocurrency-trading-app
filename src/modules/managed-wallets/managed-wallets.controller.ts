import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequireFinanceAccess, RequirePermissions } from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import {
  GetManagedWalletDepositDefaultsQuery,
  GetManagedWalletDepositDefaultsRequest,
  GetManagedWalletDetailQuery,
  GetManagedWalletDetailRequest,
  GetManagedWalletsQuery,
  GetManagedWalletsRequest,
  GetManagedWalletTransactionsQuery,
  GetManagedWalletTransactionsRequest,
} from './application/queries';
import {
  ClearDepositDefaultCommand,
  ClearDepositDefaultUseCase,
  CreateManagedWalletCommand,
  CreateManagedWalletUseCase,
  DeactivateManagedWalletCommand,
  DeactivateManagedWalletUseCase,
  SendManagedWalletTransactionCommand,
  SendManagedWalletTransactionUseCase,
  SetDepositDefaultCommand,
  SetDepositDefaultUseCase,
  SetRecommendedChainCommand,
  SetRecommendedChainUseCase,
} from './application/use-cases';import type {
  CreateManagedWalletDto,
  SendManagedTransactionDto,
  UpdateRecommendedChainDto,
} from './dto';

@ApiTags('managed-wallets')
@ApiBearerAuth('JWT-auth')
@Controller('managed-wallets')
@UseGuards(JwtAuthGuard)
export class ManagedWalletsController {
  constructor(
    private readonly createManagedWallet: CreateManagedWalletUseCase,
    private readonly getManagedWallets: GetManagedWalletsQuery,
    private readonly getManagedWalletDepositDefaults: GetManagedWalletDepositDefaultsQuery,
    private readonly getManagedWalletDetail: GetManagedWalletDetailQuery,
    private readonly getManagedWalletTransactions: GetManagedWalletTransactionsQuery,
    private readonly setRecommendedChainUseCase: SetRecommendedChainUseCase,
    private readonly sendManagedWalletTransaction: SendManagedWalletTransactionUseCase,
    private readonly setDepositDefaultUseCase: SetDepositDefaultUseCase,
    private readonly clearDepositDefaultUseCase: ClearDepositDefaultUseCase,
    private readonly deactivateManagedWalletUseCase: DeactivateManagedWalletUseCase,
  ) {}

  @Post()
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({
    summary: 'Deprecated — use POST /treasury/wallets',
    description: 'Returns 403. Wallet creation is only allowed via treasury transaction wallets.',
  })
  async createWallet(@CurrentUser('userId') userId: string, @Body() dto: CreateManagedWalletDto) {
    return this.createManagedWallet.execute(new CreateManagedWalletCommand(userId, dto));
  }

  @Get()
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_READ)
  @ApiOperation({
    summary: 'List Tron transaction wallets eligible for user deposit defaults (DEPOSIT/BOTH)',
  })
  async listWallets(@CurrentUser('userId') userId: string, @CurrentUser('role') role: UserRole) {
    return this.getManagedWallets.execute(new GetManagedWalletsRequest(userId, role));
  }

  @Get('deposit-defaults')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_READ)
  @ApiOperation({ summary: 'Get current default deposit wallets and recommended chain' })
  async getDepositDefaults() {
    return this.getManagedWalletDepositDefaults.execute(new GetManagedWalletDepositDefaultsRequest());
  }

  @Patch('settings/recommended-chain')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({ summary: 'Set the recommended deposit chain shown to users' })
  async setRecommendedChain(@Body() dto: UpdateRecommendedChainDto) {
    return this.setRecommendedChainUseCase.execute(new SetRecommendedChainCommand(dto));
  }

  @Get(':walletId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_READ)
  @ApiOperation({ summary: 'Get managed wallet details and live on-chain balance' })
  @ApiParam({ name: 'walletId', description: 'Managed wallet UUID' })
  async getWalletDetail(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('walletId') walletId: string,
  ) {
    return this.getManagedWalletDetail.execute(new GetManagedWalletDetailRequest(userId, walletId, role));
  }

  @Get(':walletId/transactions')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_READ)
  @ApiOperation({ summary: 'Get recent on-chain transactions for a managed wallet' })
  @ApiParam({ name: 'walletId', description: 'Managed wallet UUID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  async getWalletTransactions(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('walletId') walletId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.getManagedWalletTransactions.execute(
      new GetManagedWalletTransactionsRequest(userId, walletId, role, limit),
    );
  }

  @Post(':walletId/send')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_WITHDRAW)
  @ApiOperation({ summary: 'Send TRX from a managed wallet' })
  @ApiParam({ name: 'walletId', description: 'Managed wallet UUID' })
  async sendTransaction(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('walletId') walletId: string,
    @Body() dto: SendManagedTransactionDto,
  ) {
    return this.sendManagedWalletTransaction.execute(
      new SendManagedWalletTransactionCommand(walletId, userId, role, dto),
    );
  }

  @Patch(':walletId/set-deposit-default')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({
    summary: 'Set a transaction wallet as the default user deposit address for its chain',
  })
  @ApiParam({ name: 'walletId', description: 'Managed wallet UUID' })
  async setDepositDefault(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('walletId') walletId: string,
  ) {
    return this.setDepositDefaultUseCase.execute(new SetDepositDefaultCommand(walletId, userId, role));
  }

  @Patch(':walletId/clear-deposit-default')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({
    summary: 'Clear this wallet as the default user deposit address for its chain',
    description:
      'Removes the default flag. Until another default is set, public deposit methods and on-chain deposit for that Tron network stay disabled (no hot-wallet fallback).',
  })
  @ApiParam({ name: 'walletId', description: 'Managed wallet UUID' })
  async clearDepositDefault(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('walletId') walletId: string,
  ) {
    return this.clearDepositDefaultUseCase.execute(
      new ClearDepositDefaultCommand(walletId, userId, role),
    );
  }

  @Delete(':walletId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({ summary: 'Deactivate a managed wallet' })
  @ApiParam({ name: 'walletId', description: 'Managed wallet UUID' })
  async deactivateWallet(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('walletId') walletId: string,
  ) {
    return this.deactivateManagedWalletUseCase.execute(
      new DeactivateManagedWalletCommand(walletId, userId, role),
    );
  }
}
