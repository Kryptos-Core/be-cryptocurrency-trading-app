import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ApiBadRequestResponse,
  ApiSuccessResponse,
  ApiUnauthorizedResponse,
  CurrentUser,
  Public,
  RequireFinanceAccess,
  RequirePermissions,
} from '@/common/decorators';
import { BlockchainNetwork, Permission } from '@/common/enums';
import { BadRequestException } from '@/common/exceptions';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import {
  GetAdminWithdrawalByIdQuery,
  GetAdminWithdrawalByIdRequest,
  GetAdminWithdrawalStatsQuery,
  GetAdminWithdrawalStatsRequest,
  GetAdminWithdrawalsQuery,
  GetAdminWithdrawalsRequest,
  GetDepositAddressQuery,
  GetDepositAddressRequest,
  GetLinkedWalletBalanceQuery,
  GetLinkedWalletBalanceRequest,
  GetLinkedWalletsQuery,
  GetLinkedWalletsRequest,
  GetSupportedNetworksQuery,
  GetSupportedNetworksRequest,
  GetTransactionByIdQuery,
  GetTransactionByIdRequest,
  GetTransactionsQuery,
  GetTransactionsRequest,
} from './application/queries';
import {
  ApproveWithdrawalCommand,
  ApproveWithdrawalUseCase,
  PreviewDepositQuery,
  PreviewDepositUseCase,
  ProcessPendingWithdrawalsCommand,
  ProcessPendingWithdrawalsUseCase,
  RejectWithdrawalCommand,
  RejectWithdrawalUseCase,
  RequestLinkWalletCommand,
  RequestLinkWalletUseCase,
  RequestWithdrawalCommand,
  RequestWithdrawalUseCase,
  SettleDepositCommand,
  SettleDepositUseCase,
  SubmitDepositCommand,
  SubmitDepositUseCase,
  UnlinkWalletCommand,
  UnlinkWalletUseCase,
  VerifyLinkWalletCommand,
  VerifyLinkWalletUseCase,
} from './application/use-cases';
import { DepositIngestionService } from './deposit-watcher/deposit-ingestion.service';
import type {
  ManualWithdrawalActionDto,
  RequestLinkDto,
  RequestWithdrawalDto,
  SubmitDepositDto,
  VerifyLinkDto,
} from './dto';

/**
 * Blockchain Controller
 * Thin HTTP layer — delegates to application use-cases and queries.
 */
@ApiTags('blockchain')
@ApiBearerAuth('JWT-auth')
@Controller('blockchain')
@UseGuards(JwtAuthGuard)
export class BlockchainController {
  constructor(
    private readonly requestLinkWallet: RequestLinkWalletUseCase,
    private readonly verifyLinkWallet: VerifyLinkWalletUseCase,
    private readonly unlinkWalletUc: UnlinkWalletUseCase,
    private readonly previewDeposit: PreviewDepositUseCase,
    private readonly submitDepositUc: SubmitDepositUseCase,
    private readonly settleDepositUc: SettleDepositUseCase,
    private readonly requestWithdrawal: RequestWithdrawalUseCase,
    private readonly approveWithdrawal: ApproveWithdrawalUseCase,
    private readonly rejectWithdrawal: RejectWithdrawalUseCase,
    private readonly processPendingWithdrawals: ProcessPendingWithdrawalsUseCase,
    private readonly getLinkedWalletsQuery: GetLinkedWalletsQuery,
    private readonly getLinkedWalletBalanceQuery: GetLinkedWalletBalanceQuery,
    private readonly getDepositAddressQuery: GetDepositAddressQuery,
    private readonly getTransactionsQuery: GetTransactionsQuery,
    private readonly getTransactionByIdQuery: GetTransactionByIdQuery,
    private readonly getAdminWithdrawalsQuery: GetAdminWithdrawalsQuery,
    private readonly getAdminWithdrawalByIdQuery: GetAdminWithdrawalByIdQuery,
    private readonly getAdminWithdrawalStatsQuery: GetAdminWithdrawalStatsQuery,
    private readonly getSupportedNetworksQuery: GetSupportedNetworksQuery,
    private readonly depositIngestionService: DepositIngestionService,
  ) {}

  @Post('wallets/request-link')
  @ApiOperation({
    summary: 'Yêu cầu liên kết ví',
    description:
      'Tạo nonce challenge. FE cần yêu cầu user ký message này bằng ví (MetaMask/TronLink/Phantom).',
  })
  @ApiSuccessResponse('Nonce challenge tạo thành công')
  @ApiBadRequestResponse('Địa chỉ ví không hợp lệ')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async requestLink(@CurrentUser('userId') userId: string, @Body() dto: RequestLinkDto) {
    return this.requestLinkWallet.execute(new RequestLinkWalletCommand(userId, dto));
  }

  @Post('wallets/verify-link')
  @ApiOperation({
    summary: 'Xác minh liên kết ví',
    description: 'Gửi chữ ký đã ký từ ví. BE sẽ verify trên blockchain và tạo liên kết.',
  })
  @ApiSuccessResponse('Liên kết ví thành công')
  @ApiBadRequestResponse('Chữ ký không hợp lệ hoặc nonce hết hạn')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async verifyLink(@CurrentUser('userId') userId: string, @Body() dto: VerifyLinkDto) {
    return this.verifyLinkWallet.execute(new VerifyLinkWalletCommand(userId, dto));
  }

  @Get('wallets')
  @ApiOperation({
    summary: 'Danh sách ví liên kết',
    description: 'Lấy tất cả ví on-chain đã liên kết của user (trừ REVOKED)',
  })
  @ApiSuccessResponse('Danh sách ví liên kết')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getLinkedWallets(@CurrentUser('userId') userId: string) {
    return this.getLinkedWalletsQuery.execute(new GetLinkedWalletsRequest(userId));
  }

  @Get('wallets/:linkId/balance')
  @ApiOperation({
    summary: 'Số dư on-chain ví liên kết',
    description: 'Truy vấn balance trực tiếp từ blockchain testnet',
  })
  @ApiParam({ name: 'linkId', description: 'ID ví liên kết' })
  @ApiSuccessResponse('Số dư on-chain')
  @ApiBadRequestResponse('Ví liên kết không tìm thấy')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getLinkedWalletBalance(
    @CurrentUser('userId') userId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.getLinkedWalletBalanceQuery.execute(
      new GetLinkedWalletBalanceRequest(userId, linkId),
    );
  }

  @Delete('wallets/:linkId')
  @ApiOperation({
    summary: 'Huỷ liên kết ví',
    description: 'Soft delete - đặt status = REVOKED',
  })
  @ApiParam({ name: 'linkId', description: 'ID ví liên kết' })
  @ApiSuccessResponse('Huỷ liên kết thành công')
  @ApiBadRequestResponse('Ví liên kết không tìm thấy')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async unlinkWallet(@CurrentUser('userId') userId: string, @Param('linkId') linkId: string) {
    return this.unlinkWalletUc.execute(new UnlinkWalletCommand(userId, linkId));
  }

  @Get('deposit/address')
  @ApiOperation({
    summary: 'Lấy địa chỉ nạp tiền theo mạng',
    description:
      'Tron mainnet (TRC-20): địa chỉ từ transaction_wallets default nạp user. Các chain khác: ví nóng. Không có default Tron -> 400.',
  })
  @ApiQuery({
    name: 'chain',
    required: true,
    type: String,
    example: 'ETH_MAINNET',
  })
  @ApiSuccessResponse('Địa chỉ nạp tiền theo mạng')
  @ApiBadRequestResponse('Thiếu chain hoặc chain không hợp lệ')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getDepositAddress(@Query('chain') chain?: string) {
    return this.getDepositAddressQuery.execute(new GetDepositAddressRequest(chain ?? ''));
  }

  @Get('deposit/preview')
  @ApiOperation({
    summary: 'Preview giao dịch nạp theo txHash',
    description: 'Kiểm tra nhanh giao dịch on-chain để FE tự điền amount trước khi submit deposit.',
  })
  @ApiQuery({ name: 'chain', required: true, type: String, example: 'ETH_MAINNET' })
  @ApiQuery({ name: 'txHash', required: true, type: String })
  @ApiSuccessResponse('Thông tin preview giao dịch nạp')
  @ApiBadRequestResponse('Thiếu chain/txHash hoặc txHash không hợp lệ')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async previewDepositTx(
    @CurrentUser('userId') userId: string,
    @Query('chain') chain?: string,
    @Query('txHash') txHash?: string,
  ) {
    if (!chain) {
      throw new BadRequestException('Thiếu query param chain', 'CHAIN_REQUIRED');
    }
    if (!txHash) {
      throw new BadRequestException('Thiếu query param txHash', 'TX_HASH_REQUIRED');
    }

    const normalizedChain = chain.toUpperCase() as BlockchainNetwork;
    return this.previewDeposit.execute(new PreviewDepositQuery(userId, normalizedChain, txHash));
  }

  @Post('deposit/submit')
  @ApiOperation({
    summary: 'Nạp tiền (submit txHash)',
    description:
      'User gửi coin on-chain rồi submit txHash. BE verify trên blockchain và ghi nhận deposit.',
  })
  @ApiSuccessResponse('Nạp tiền thành công')
  @ApiBadRequestResponse('TxHash không hợp lệ hoặc giao dịch lỗi')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async submitDeposit(@CurrentUser('userId') userId: string, @Body() dto: SubmitDepositDto) {
    return this.submitDepositUc.execute(new SubmitDepositCommand(userId, dto));
  }

  @Post('deposit/:txId/settle')
  @ApiOperation({
    summary: 'Settle nạp tiền on-chain',
    description: 'Re-check trạng thái on-chain và credit wallet ledger khi giao dịch đã CONFIRMED.',
  })
  @ApiParam({ name: 'txId', description: 'ID giao dịch nạp on-chain' })
  @ApiSuccessResponse('Settle nạp tiền thành công')
  @ApiBadRequestResponse('Giao dịch nạp không hợp lệ hoặc chưa confirm')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async settleDeposit(@CurrentUser('userId') userId: string, @Param('txId') txId: string) {
    return this.settleDepositUc.execute(new SettleDepositCommand(userId, txId));
  }

  @Post('withdraw/request')
  @ApiOperation({
    summary: 'Yêu cầu rút tiền',
    description: 'Gửi coin từ platform về ví liên kết đã verified. Xử lý async.',
  })
  @ApiSuccessResponse('Yêu cầu rút tiền đã tiếp nhận')
  @ApiBadRequestResponse('Ví chưa xác minh hoặc balance không đủ')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async requestWithdrawalEndpoint(
    @CurrentUser('userId') userId: string,
    @Body() dto: RequestWithdrawalDto,
  ) {
    return this.requestWithdrawal.execute(new RequestWithdrawalCommand(userId, dto));
  }

  @Post('withdraw/manual/:txId/approve')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({
    summary: 'Approve manual withdrawal',
    description:
      'Dùng cho luồng hybrid khi amount vượt ngưỡng auto-send. Sẽ gửi on-chain và settle ledger.',
  })
  @ApiParam({ name: 'txId', description: 'ID giao dịch rút tiền pending manual' })
  @ApiSuccessResponse('Approve manual withdrawal thành công')
  @ApiBadRequestResponse('Giao dịch không hợp lệ hoặc không còn trạng thái pending review')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async approveManualWithdrawal(
    @CurrentUser('userId') actorUserId: string,
    @Param('txId') txId: string,
    @Body() _dto: ManualWithdrawalActionDto,
  ) {
    return this.approveWithdrawal.execute(new ApproveWithdrawalCommand(actorUserId, txId));
  }

  @Post('withdraw/manual/:txId/reject')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({
    summary: 'Reject manual withdrawal',
    description: 'Từ chối yêu cầu manual review và hoàn frozen balance về available.',
  })
  @ApiParam({ name: 'txId', description: 'ID giao dịch rút tiền pending manual' })
  @ApiSuccessResponse('Reject manual withdrawal thành công')
  @ApiBadRequestResponse('Giao dịch không hợp lệ hoặc không còn trạng thái pending review')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async rejectManualWithdrawal(
    @CurrentUser('userId') actorUserId: string,
    @Param('txId') txId: string,
    @Body() dto: ManualWithdrawalActionDto,
  ) {
    return this.rejectWithdrawal.execute(
      new RejectWithdrawalCommand(actorUserId, txId, dto.reason),
    );
  }

  @Post('withdraw/manual/process-pending')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({
    summary: 'Process pending manual withdrawals',
    description:
      'Worker/job gọi endpoint này để xử lý batch các withdrawal đang pending manual review.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiSuccessResponse('Xử lý batch pending manual withdrawal thành công')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async processPendingManualWithdrawals(
    @CurrentUser('userId') actorUserId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.processPendingWithdrawals.execute(
      new ProcessPendingWithdrawalsCommand(actorUserId, parsedLimit),
    );
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Lịch sử giao dịch on-chain',
    description: 'Danh sách deposit/withdrawal/transfer on-chain',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiSuccessResponse('Lịch sử giao dịch')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getTransactions(@CurrentUser('userId') userId: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.getTransactionsQuery.execute(new GetTransactionsRequest(userId, parsedLimit));
  }

  @Get('transactions/:txId')
  @ApiOperation({
    summary: 'Chi tiết 1 giao dịch',
    description: 'Lấy thông tin chi tiết 1 giao dịch',
  })
  @ApiParam({ name: 'txId', description: 'ID giao dịch on-chain' })
  @ApiSuccessResponse('Chi tiết giao dịch')
  @ApiBadRequestResponse('Giao dịch không tìm thấy')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getTransaction(@CurrentUser('userId') userId: string, @Param('txId') txId: string) {
    return this.getTransactionByIdQuery.execute(new GetTransactionByIdRequest(userId, txId));
  }

  @Get('admin/withdrawals/stats')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({
    summary: 'Admin: Withdrawal stats',
    description: 'Pending count and total amount by chain.',
  })
  async getAdminWithdrawalStats() {
    return this.getAdminWithdrawalStatsQuery.execute(new GetAdminWithdrawalStatsRequest());
  }

  @Get('admin/withdrawals/:txId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({
    summary: 'Admin: Withdrawal detail',
    description: 'Single withdrawal with user info and wallet balance.',
  })
  @ApiParam({ name: 'txId', description: 'ID giao dịch rút tiền' })
  async getAdminWithdrawalDetail(@Param('txId') txId: string) {
    return this.getAdminWithdrawalByIdQuery.execute(new GetAdminWithdrawalByIdRequest(txId));
  }

  @Get('admin/withdrawals')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({
    summary: 'Admin: List all withdrawal transactions',
    description: 'Paginated list of all onchain withdrawal transactions across all users.',
  })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED'],
  })
  @ApiQuery({ name: 'chain', required: false, type: String })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search email, name, address, txId',
  })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listAdminWithdrawals(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('chain') chain?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return this.getAdminWithdrawalsQuery.execute(
      new GetAdminWithdrawalsRequest({
        userId,
        status,
        chain,
        search,
        dateFrom,
        dateTo,
        page,
        limit,
      }),
    );
  }

  @Get('networks')
  @Public()
  @ApiOperation({
    summary: 'Danh sách mạng blockchain',
    description: 'Trả về các mạng testnet được hỗ trợ',
  })
  @ApiSuccessResponse('Danh sách mạng')
  getSupportedNetworks() {
    return this.getSupportedNetworksQuery.execute(new GetSupportedNetworksRequest());
  }

  // ---------------------------------------------------------------------------
  // Admin: manual deposit ingest
  // ---------------------------------------------------------------------------

  @Post('admin/deposits/ingest')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.DEPOSITS_MANAGE)
  @ApiOperation({
    summary: '[Admin] Force-ingest một tx hash cụ thể',
    description:
      'Cho phép admin re-ingest một giao dịch bị bỏ sót hoặc tạo UNMATCHED record thủ công. Idempotent — gọi lại khi đã có row sẽ trả ConflictException.',
  })
  @ApiSuccessResponse('Kết quả ingest')
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse()
  async adminForceIngestDeposit(
    @Body() body: { chain: BlockchainNetwork; txHash: string; logIndex?: number },
  ) {
    if (!body.chain || !body.txHash?.trim()) {
      throw new BadRequestException('chain và txHash là bắt buộc', 'ADMIN_INGEST_MISSING_PARAMS');
    }
    await this.depositIngestionService.ingestTxHash(body.chain, body.txHash.trim(), body.logIndex);
    return { ok: true, chain: body.chain, txHash: body.txHash.trim() };
  }
}
