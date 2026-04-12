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
import { CurrentUser, RequirePermissions, RequireRoles } from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import type {
  CreateManagedWalletDto,
  SendManagedTransactionDto,
  UpdateRecommendedChainDto,
} from './dto';
import { ManagedWalletsService } from './managed-wallets.service';

@ApiTags('managed-wallets')
@ApiBearerAuth('JWT-auth')
@Controller('managed-wallets')
@UseGuards(JwtAuthGuard)
export class ManagedWalletsController {
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  @Post()
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({
    summary: 'Deprecated — use POST /treasury/wallets',
    description: 'Returns 403. Wallet creation is only allowed via treasury transaction wallets.',
  })
  async createWallet(@CurrentUser('userId') userId: string, @Body() dto: CreateManagedWalletDto) {
    return this.managedWalletsService.createWallet(userId, dto);
  }

  @Get()
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.WALLETS_READ)
  @ApiOperation({
    summary: 'List Tron transaction wallets eligible for user deposit defaults (DEPOSIT/BOTH)',
  })
  async listWallets(@CurrentUser('userId') userId: string, @CurrentUser('role') role: UserRole) {
    return this.managedWalletsService.listWallets(userId, role);
  }

  @Get('deposit-defaults')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.WALLETS_READ)
  @ApiOperation({ summary: 'Get current default deposit wallets and recommended chain' })
  async getDepositDefaults() {
    return this.managedWalletsService.getDepositDefaults();
  }

  @Patch('settings/recommended-chain')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({ summary: 'Set the recommended deposit chain shown to users' })
  async setRecommendedChain(@Body() dto: UpdateRecommendedChainDto) {
    return this.managedWalletsService.setRecommendedChain(dto);
  }

  @Get(':walletId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.WALLETS_READ)
  @ApiOperation({ summary: 'Get managed wallet details and live on-chain balance' })
  @ApiParam({ name: 'walletId', description: 'Managed wallet UUID' })
  async getWalletDetail(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('walletId') walletId: string,
  ) {
    return this.managedWalletsService.getWalletDetail(userId, walletId, role);
  }

  @Get(':walletId/transactions')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
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
    return this.managedWalletsService.getWalletTransactions(userId, walletId, role, limit);
  }

  @Post(':walletId/send')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.WALLETS_WITHDRAW)
  @ApiOperation({ summary: 'Send TRX from a managed wallet' })
  @ApiParam({ name: 'walletId', description: 'Managed wallet UUID' })
  async sendTransaction(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('walletId') walletId: string,
    @Body() dto: SendManagedTransactionDto,
  ) {
    return this.managedWalletsService.sendTransaction(userId, walletId, role, dto);
  }

  @Patch(':walletId/set-deposit-default')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
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
    return this.managedWalletsService.setDepositDefault(userId, walletId, role);
  }

  @Patch(':walletId/clear-deposit-default')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
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
    return this.managedWalletsService.clearDepositDefault(userId, walletId, role);
  }

  @Delete(':walletId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiOperation({ summary: 'Deactivate a managed wallet' })
  @ApiParam({ name: 'walletId', description: 'Managed wallet UUID' })
  async deactivateWallet(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('walletId') walletId: string,
  ) {
    return this.managedWalletsService.deactivateWallet(userId, walletId, role);
  }
}
