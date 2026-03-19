import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, RequireRoles } from '@/common/decorators';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { Permission, UserRole } from '@/common/enums';
import {
  CreateTransactionWalletDto,
  FundWalletDto,
  ListTreasuryOperationsDto,
  ListTreasuryTransactionsDto,
  ListTreasuryWalletsDto,
  SweepWalletDto,
} from './dto';
import { TransactionWalletService } from './transaction-wallet.service';
import { TreasuryMainWalletService } from './treasury-main-wallet.service';
import { TreasuryOperationsService } from './treasury-operations.service';

@ApiTags('treasury')
@ApiBearerAuth('JWT-auth')
@Controller('treasury')
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
@RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
export class TreasuryController {
  constructor(
    private readonly transactionWalletService: TransactionWalletService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
    private readonly treasuryOperationsService: TreasuryOperationsService,
  ) {}

  @Get('wallets')
  @ApiOperation({ summary: 'List transaction wallets with optional chain/purpose filters' })
  async listWallets(@Query() query: ListTreasuryWalletsDto) {
    return this.transactionWalletService.listWallets(query);
  }

  @Post('wallets')
  @ApiOperation({ summary: 'Create a new transaction wallet' })
  async createWallet(@Body() dto: CreateTransactionWalletDto) {
    return this.transactionWalletService.createWallet(dto);
  }

  @Get('wallets/:walletId')
  @ApiOperation({ summary: 'Get transaction wallet detail with live on-chain balance' })
  async getWalletById(@Param('walletId') walletId: string) {
    return this.transactionWalletService.getWalletDetail(walletId);
  }

  @Get('main-wallets')
  @ApiOperation({ summary: 'List main wallets for a chain (sweep targets)' })
  async listMainWallets(@Query('chain') chain: string) {
    return this.treasuryMainWalletService.listByChain(
      chain as 'ETH_SEPOLIA' | 'ETH_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA' | 'TRON_MAINNET',
    );
  }

  @Post('wallets/:walletId/sweep')
  @ApiOperation({ summary: 'Sweep transaction wallet balance back to main wallet via queue' })
  async sweepWallet(
    @Param('walletId') walletId: string,
    @Body() dto: SweepWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryOperationsService.enqueueSweep(
      walletId,
      actorUserId,
      dto.mainWalletId,
    );
  }

  @Post('wallets/:walletId/fund')
  @ApiOperation({ summary: 'Fund transaction wallet from main wallet via queue' })
  async fundWallet(
    @Param('walletId') walletId: string,
    @Body() dto: FundWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryOperationsService.enqueueFund(walletId, dto, actorUserId);
  }

  @Get('operations')
  @ApiOperation({ summary: 'List treasury operations (SWEEP/FUND) with filters and pagination' })
  async listOperations(@Query() query: ListTreasuryOperationsDto) {
    return this.treasuryOperationsService.listOperations(query);
  }

  @Get('operations/:operationId')
  @ApiOperation({ summary: 'Get treasury operation detail' })
  async getOperation(@Param('operationId') operationId: string) {
    return this.treasuryOperationsService.getOperation(operationId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List treasury on-chain transactions (SWEEP/FUND) with filters and pagination' })
  async listTransactions(@Query() query: ListTreasuryTransactionsDto) {
    return this.treasuryOperationsService.listTreasuryTransactions(query);
  }
}
