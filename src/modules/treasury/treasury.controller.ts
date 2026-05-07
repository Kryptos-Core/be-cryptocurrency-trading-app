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
import { CurrentUser, Public, RequirePermissions, RequireRoles } from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { BadRequestException } from '@/common/exceptions';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { TwoFaService } from '@/modules/auth/two-fa.service';
import {
  ApproveMainWalletDeletionUseCase,
  ApproveMainWalletUseCase,
  CreateTransactionWalletUseCase,
  DeleteTransactionWalletUseCase,
  GetMainWalletQuery,
  GetTransactionWalletQuery,
  GetTreasuryOperationQuery,
  ImportMainWalletUseCase,
  RejectMainWalletDeletionUseCase,
  RejectMainWalletUseCase,
  RequestMainWalletDeletionUseCase,
  RevealMainWalletPrivateKeyUseCase,
  SetDefaultMainWalletUseCase,
  SetDefaultUserDepositUseCase,
  UnsetDefaultUserDepositUseCase,
  UpdateMainWalletLabelUseCase,
} from './application';
import type {
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
import {
  ManualAbortTreasuryOperationDto,
  ManualRetryTreasuryOperationDto,
  ManualSettleTreasuryOperationDto,
} from './dto';
import { OnchainChainPickerService } from './onchain-chain-picker.service';
import type { SupportedTreasuryChain } from './treasury-main-wallet.service';
import { TreasuryOperationsService } from './treasury-operations.service';

@ApiTags('treasury')
@ApiBearerAuth('JWT-auth')
@Controller('treasury')
@UseGuards(JwtAuthGuard)
export class TreasuryController {
  constructor(
    private readonly getMainWalletQuery: GetMainWalletQuery,
    private readonly getTransactionWalletQuery: GetTransactionWalletQuery,
    private readonly getTreasuryOperationQuery: GetTreasuryOperationQuery,
    private readonly importMainWalletUseCase: ImportMainWalletUseCase,
    private readonly approveMainWalletUseCase: ApproveMainWalletUseCase,
    private readonly rejectMainWalletUseCase: RejectMainWalletUseCase,
    private readonly setDefaultMainWalletUseCase: SetDefaultMainWalletUseCase,
    private readonly revealMainWalletPrivateKeyUseCase: RevealMainWalletPrivateKeyUseCase,
    private readonly updateMainWalletLabelUseCase: UpdateMainWalletLabelUseCase,
    private readonly requestMainWalletDeletionUseCase: RequestMainWalletDeletionUseCase,
    private readonly approveMainWalletDeletionUseCase: ApproveMainWalletDeletionUseCase,
    private readonly rejectMainWalletDeletionUseCase: RejectMainWalletDeletionUseCase,
    private readonly createTransactionWalletUseCase: CreateTransactionWalletUseCase,
    private readonly deleteTransactionWalletUseCase: DeleteTransactionWalletUseCase,
    readonly _setDefaultUserDepositUseCase: SetDefaultUserDepositUseCase,
    readonly _unsetDefaultUserDepositUseCase: UnsetDefaultUserDepositUseCase,
    private readonly treasuryOperationsService: TreasuryOperationsService,
    private readonly twoFaService: TwoFaService,
    private readonly onchainChainPickerService: OnchainChainPickerService,
  ) {}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Chain picker (admin UI — mirrors server env; Flutter consumes as single source of truth)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  @Get('chain-picker-options')
  @Public()
  @ApiOperation({
    summary:
      'Chain codes for treasury / hot-wallet / withdrawal / managed-wallet / user on-chain deposit-withdraw pickers (ONCHAIN_OPERATOR_MODE, TRON_DEFAULT_NETWORK, ENV)',
  })
  getChainPickerOptions() {
    return this.onchainChainPickerService.getChainPickerOptions();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Transaction Wallets (ví giao dịch)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  @Get('wallets')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'List transaction wallets with optional chain/purpose filters' })
  async listWallets(@Query() query: ListTreasuryWalletsDto) {
    return this.getTransactionWalletQuery.listWallets(query);
  }

  @Post('wallets')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Create a new transaction wallet' })
  async createWallet(@Body() dto: CreateTransactionWalletDto) {
    return this.createTransactionWalletUseCase.execute(dto);
  }

  @Get('wallets/:walletId')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Get transaction wallet detail with live on-chain balance' })
  async getWalletById(@Param('walletId') walletId: string) {
    return this.getTransactionWalletQuery.getWalletDetail(walletId);
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
    return this.treasuryOperationsService.enqueueSweep(walletId, actorUserId, dto);
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
    await this.deleteTransactionWalletUseCase.execute(walletId, actorUserId);
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
    return this.getMainWalletQuery.listByChain(chain as SupportedTreasuryChain);
  }

  @Get('main-wallets/pending')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.RISK_OFFICER)
  @ApiOperation({
    summary:
      'List main wallets pending Risk approval (Finance/Admin can track imports; only Risk approves/rejects)',
  })
  async listPendingMainWallets() {
    return this.getMainWalletQuery.listPendingApproval();
  }

  /**
   * POST /treasury/main-wallets
   * Import a new main wallet by private key.
   * Requires: ADMIN or FINANCE_MANAGER + PAYMENT_CONFIGS_MANAGE
   * MFA: verifies the mfaCode (email OTP) before processing.
   * Result: ACTIVE immediately for Finance/Admin (no Risk approval). Risk approve/reject remains for any legacy PENDING rows.
   */
  @Post('main-wallets')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({
    summary:
      'Import a main wallet from private key (MFA required). Finance/Admin: wallet is ACTIVE immediately.',
  })
  async importMainWallet(
    @Body() dto: ImportMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
    @CurrentUser('role') actorRole: UserRole,
  ) {
    // ── MFA verification (consumes OTP) ──────────────────────────────────
    const mfaValid = await this.twoFaService.verifyOtp(actorUserId, dto.mfaCode);
    if (!mfaValid) {
      throw new BadRequestException(
        'Invalid or expired MFA code. Request a new OTP via POST /auth/2fa/send-otp and try again.',
        'INVALID_MFA_CODE',
      );
    }

    return this.importMainWalletUseCase.execute(dto, actorUserId, actorRole);
  }

  /**
   * PATCH /treasury/main-wallets/:id/approve
   * Risk Officer approves a PENDING_APPROVAL wallet → ACTIVE.
   * Auto-sets as default if no active default exists for the chain.
   */
  @Patch('main-wallets/:mainWalletId/approve')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Admin or Risk Officer: approve a pending main wallet import' })
  async approveMainWallet(
    @Param('mainWalletId') mainWalletId: string,
    @Body() _dto: ReviewMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.approveMainWalletUseCase.execute(mainWalletId, actorUserId);
  }

  /**
   * PATCH /treasury/main-wallets/:id/reject
   * Risk Officer rejects a PENDING_APPROVAL wallet → REJECTED.
   */
  @Patch('main-wallets/:mainWalletId/reject')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Admin or Risk Officer: reject a pending main wallet import' })
  async rejectMainWallet(
    @Param('mainWalletId') mainWalletId: string,
    @Body() _dto: ReviewMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.rejectMainWalletUseCase.execute(mainWalletId, actorUserId);
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
    return this.setDefaultMainWalletUseCase.execute(mainWalletId, actorUserId);
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
    return this.revealMainWalletPrivateKeyUseCase.execute(mainWalletId, actorUserId);
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
    return this.updateMainWalletLabelUseCase.execute(mainWalletId, dto.label, actorUserId);
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
    return this.requestMainWalletDeletionUseCase.execute(mainWalletId, actorUserId);
  }

  /**
   * PATCH /treasury/main-wallets/:id/approve-deletion
   * Risk Officer confirms deletion — wallet row is removed.
   */
  @Patch('main-wallets/:mainWalletId/approve-deletion')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Admin or Risk Officer: approve pending main wallet deletion' })
  async approveMainWalletDeletion(
    @Param('mainWalletId') mainWalletId: string,
    @Body() _dto: ReviewMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    await this.approveMainWalletDeletionUseCase.execute(mainWalletId, actorUserId);
    return { success: true };
  }

  /**
   * PATCH /treasury/main-wallets/:id/reject-deletion
   * Risk Officer rejects deletion — wallet returns to ACTIVE.
   */
  @Patch('main-wallets/:mainWalletId/reject-deletion')
  @UseGuards(RoleGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @ApiOperation({ summary: 'Admin or Risk Officer: reject pending main wallet deletion' })
  async rejectMainWalletDeletion(
    @Param('mainWalletId') mainWalletId: string,
    @Body() _dto: ReviewMainWalletDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.rejectMainWalletDeletionUseCase.execute(mainWalletId, actorUserId);
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
    return this.getTreasuryOperationQuery.listOperations(query);
  }

  @Get('operations/:operationId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Get treasury operation detail' })
  async getOperation(@Param('operationId') operationId: string) {
    return this.getTreasuryOperationQuery.getOperation(operationId);
  }

  @Post('operations/:operationId/manual-retry')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({
    summary:
      'Re-queue a stuck Fund/Sweep job (releases wallet lock, sets PENDING, enqueues worker). SWEEP: optional mainWalletId when sweep targeted a specific main wallet.',
  })
  async manualRetryTreasuryOperation(
    @Param('operationId') operationId: string,
    @Body() dto: ManualRetryTreasuryOperationDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryOperationsService.manualRetryTreasuryOperation(
      operationId,
      dto.mainWalletId,
      actorUserId,
    );
  }

  @Post('operations/:operationId/manual-abort')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({
    summary:
      'Mark a stuck Fund/Sweep operation as FAILED and release wallet lock (operator escape hatch)',
  })
  async manualAbortTreasuryOperation(
    @Param('operationId') operationId: string,
    @Body() dto: ManualAbortTreasuryOperationDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryOperationsService.manualAbortTreasuryOperation(
      operationId,
      dto.reason,
      actorUserId,
    );
  }

  @Post('operations/:operationId/manual-settle')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({
    summary:
      'Finalize operation with an on-chain tx hash when automation did not complete (operator attestation). SWEEP: optional mainWalletId if destination main wallet was non-default.',
  })
  async manualSettleTreasuryOperation(
    @Param('operationId') operationId: string,
    @Body() dto: ManualSettleTreasuryOperationDto,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.treasuryOperationsService.manualSettleTreasuryOperation(
      operationId,
      dto,
      actorUserId,
    );
  }

  @Get('transactions')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'List treasury on-chain transactions (SWEEP/FUND)' })
  async listTransactions(@Query() query: ListTreasuryTransactionsDto) {
    return this.getTreasuryOperationQuery.listTreasuryTransactions(query);
  }
}
