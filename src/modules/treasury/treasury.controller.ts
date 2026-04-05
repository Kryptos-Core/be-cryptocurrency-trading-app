import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, RequireRoles } from '@/common/decorators';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { Permission, UserRole } from '@/common/enums';
import { TwoFaService } from '@/modules/auth/two-fa.service';
import { BadRequestException } from '@/common/exceptions';
import {
  CreateTransactionWalletDto,
  FundWalletDto,
  ImportMainWalletDto,
  ListTreasuryOperationsDto,
  ListTreasuryTransactionsDto,
  ListTreasuryWalletsDto,
  RevealMainWalletPrivateKeyDto,
  ReviewMainWalletDto,
  SweepWalletDto,
  UpdateMainWalletDto,
} from './dto';
import { SupportedTreasuryChain, TreasuryMainWalletService } from './treasury-main-wallet.service';
import { TransactionWalletService } from './transaction-wallet.service';
import { TreasuryOperationsService } from './treasury-operations.service';

@ApiTags('treasury')
@ApiBearerAuth('JWT-auth')
@Controller('treasury')
@UseGuards(JwtAuthGuard)
export class TreasuryController {
  constructor(
    private readonly transactionWalletService: TransactionWalletService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
    private readonly treasuryOperationsService: TreasuryOperationsService,
    private readonly twoFaService: TwoFaService,
  ) {}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Transaction Wallets (ví giao dịch)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  @Get('wallets')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'List transaction wallets with optional chain/purpose filters' })
  async listWallets(@Query() query: ListTreasuryWalletsDto) {
    return this.transactionWalletService.listWallets(query);
  }

  @Post('wallets')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Create a new transaction wallet' })
  async createWallet(@Body() dto: CreateTransactionWalletDto) {
    return this.transactionWalletService.createWallet(dto);
  }

  @Get('wallets/:walletId')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Get transaction wallet detail with live on-chain balance' })
  async getWalletById(@Param('walletId') walletId: string) {
    return this.transactionWalletService.getWalletDetail(walletId);
  }

  @Post('wallets/:walletId/sweep')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Sweep transaction wallet balance back to main wallet via queue' })
  async sweepWallet(
    @Param('walletId') walletId: string,
    @Body() dto: SweepWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryOperationsService.enqueueSweep(walletId, actorUserId, dto.mainWalletId);
  }

  @Post('wallets/:walletId/fund')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Fund transaction wallet from main wallet via queue' })
  async fundWallet(
    @Param('walletId') walletId: string,
    @Body() dto: FundWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryOperationsService.enqueueFund(walletId, dto, actorUserId);
  }

  @Delete('wallets/:walletId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({
    summary:
      'Delete a transaction wallet (near-zero balance, no in-flight Fund/Sweep, not user deposit default)',
  })
  async deleteTransactionWallet(
    @Param('walletId') walletId: string,
    @CurrentUser('userId') actorUserId: string,
  ) {
    await this.transactionWalletService.deleteWallet(walletId, actorUserId);
    return { ok: true };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Main Wallets (ví chính) — CRUD + Approval Workflow
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  @Get('main-wallets')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'List main wallets for a chain (auto-seeded or imported)' })
  async listMainWallets(@Query('chain') chain: string) {
    return this.treasuryMainWalletService.listByChain(
      chain as SupportedTreasuryChain,
    );
  }

  @Get('main-wallets/pending')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({
    summary:
      'List main wallets pending Risk approval (Finance/Admin can track imports; only Risk approves/rejects)',
  })
  async listPendingMainWallets() {
    return this.treasuryMainWalletService.listPendingApproval();
  }

  /**
   * POST /treasury/main-wallets
   * Import a new main wallet by private key.
   * Requires: ADMIN or FINANCE_MANAGER + PAYMENT_CONFIGS_MANAGE
   * MFA: verifies the mfaCode (email OTP) before processing.
   * Result: wallet created in PENDING_APPROVAL status — awaits Risk Officer approval.
   */
  @Post('main-wallets')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({
    summary: 'Import a main wallet from private key (MFA required). Creates PENDING_APPROVAL record.',
  })
  async importMainWallet(
    @Body() dto: ImportMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    // ── MFA verification (consumes OTP) ──────────────────────────────────
    const mfaValid = await this.twoFaService.verifyOtp(actorUserId, dto.mfaCode);
    if (!mfaValid) {
      throw new BadRequestException(
        'Invalid or expired MFA code. Request a new OTP via POST /auth/2fa/send-otp and try again.',
        'INVALID_MFA_CODE',
      );
    }

    return this.treasuryMainWalletService.importMainWallet(dto, actorUserId);
  }

  /**
   * PATCH /treasury/main-wallets/:id/approve
   * Risk Officer approves a PENDING_APPROVAL wallet → ACTIVE.
   * Auto-sets as default if no active default exists for the chain.
   */
  @Patch('main-wallets/:mainWalletId/approve')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Risk Officer: approve a pending main wallet import' })
  async approveMainWallet(
    @Param('mainWalletId') mainWalletId: string,
    @Body() _dto: ReviewMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryMainWalletService.approveMainWallet(mainWalletId, actorUserId);
  }

  /**
   * PATCH /treasury/main-wallets/:id/reject
   * Risk Officer rejects a PENDING_APPROVAL wallet → REJECTED.
   */
  @Patch('main-wallets/:mainWalletId/reject')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Risk Officer: reject a pending main wallet import' })
  async rejectMainWallet(
    @Param('mainWalletId') mainWalletId: string,
    @Body() _dto: ReviewMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryMainWalletService.rejectMainWallet(mainWalletId, actorUserId);
  }

  /**
   * PATCH /treasury/main-wallets/:id/set-default
   * Set an ACTIVE main wallet as the default for its chain.
   */
  @Patch('main-wallets/:mainWalletId/set-default')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Set an active main wallet as the default for its chain' })
  async setDefaultMainWallet(
    @Param('mainWalletId') mainWalletId: string,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryMainWalletService.setDefault(mainWalletId, actorUserId);
  }

  /**
   * POST /treasury/main-wallets/:id/reveal-private-key
   * Returns decrypted private key after email OTP verification (same as import).
   */
  @Post('main-wallets/:mainWalletId/reveal-private-key')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Reveal main wallet private key (MFA required)' })
  async revealMainWalletPrivateKey(
    @Param('mainWalletId') mainWalletId: string,
    @Body() dto: RevealMainWalletPrivateKeyDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    const mfaValid = await this.twoFaService.verifyOtp(actorUserId, dto.mfaCode);
    if (!mfaValid) {
      throw new BadRequestException(
        'Invalid or expired MFA code. Request a new OTP via POST /auth/2fa/send-otp and try again.',
        'INVALID_MFA_CODE',
      );
    }
    return this.treasuryMainWalletService.revealPrivateKey(mainWalletId, actorUserId);
  }

  /**
   * PATCH /treasury/main-wallets/:id — update label only.
   */
  @Patch('main-wallets/:mainWalletId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Update main wallet label' })
  async updateMainWallet(
    @Param('mainWalletId') mainWalletId: string,
    @Body() dto: UpdateMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryMainWalletService.updateMainWalletLabel(
      mainWalletId,
      dto.label,
      actorUserId,
    );
  }

  /**
   * PATCH /treasury/main-wallets/:id/request-deletion
   * Finance/Admin marks wallet for deletion — Risk must approve before the row is removed.
   */
  @Patch('main-wallets/:mainWalletId/request-deletion')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({
    summary: 'Request main wallet deletion (awaiting Risk Officer approval)',
  })
  async requestMainWalletDeletion(
    @Param('mainWalletId') mainWalletId: string,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryMainWalletService.requestMainWalletDeletion(mainWalletId, actorUserId);
  }

  /**
   * PATCH /treasury/main-wallets/:id/approve-deletion
   * Risk Officer confirms deletion — wallet row is removed.
   */
  @Patch('main-wallets/:mainWalletId/approve-deletion')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Risk Officer: approve pending main wallet deletion' })
  async approveMainWalletDeletion(
    @Param('mainWalletId') mainWalletId: string,
    @Body() _dto: ReviewMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    await this.treasuryMainWalletService.approveMainWalletDeletion(mainWalletId, actorUserId);
    return { success: true };
  }

  /**
   * PATCH /treasury/main-wallets/:id/reject-deletion
   * Risk Officer rejects deletion — wallet returns to ACTIVE.
   */
  @Patch('main-wallets/:mainWalletId/reject-deletion')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Risk Officer: reject pending main wallet deletion' })
  async rejectMainWalletDeletion(
    @Param('mainWalletId') mainWalletId: string,
    @Body() _dto: ReviewMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryMainWalletService.rejectMainWalletDeletion(mainWalletId, actorUserId);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Operations & Transactions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  @Get('operations')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'List treasury operations (SWEEP/FUND) with filters and pagination' })
  async listOperations(@Query() query: ListTreasuryOperationsDto) {
    return this.treasuryOperationsService.listOperations(query);
  }

  @Get('operations/:operationId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Get treasury operation detail' })
  async getOperation(@Param('operationId') operationId: string) {
    return this.treasuryOperationsService.getOperation(operationId);
  }

  @Get('transactions')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'List treasury on-chain transactions (SWEEP/FUND)' })
  async listTransactions(@Query() query: ListTreasuryTransactionsDto) {
    return this.treasuryOperationsService.listTreasuryTransactions(query);
  }
}
