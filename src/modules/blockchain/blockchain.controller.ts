import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { JwtAuthGuard, RoleGuard, PermissionGuard } from '@/common/guards';
import { CurrentUser, Public, RequirePermissions, RequireRoles } from '@/common/decorators';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@/common/decorators';
import { BadRequestException } from '@/common/exceptions';
import { BlockchainNetwork, Permission, UserRole } from '@/common/enums';
import { WalletLinkingService } from './wallet-linking.service';
import { OnchainTransferService } from './onchain-transfer.service';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import {
  RequestLinkDto,
  VerifyLinkDto,
  SubmitDepositDto,
  RequestWithdrawalDto,
  ManualWithdrawalActionDto,
} from './dto';

/**
 * Blockchain Controller
 * Endpoints cho liên kết ví, nạp/rút tiền on-chain
 */
@ApiTags('blockchain')
@ApiBearerAuth('JWT-auth')
@Controller('blockchain')
@UseGuards(JwtAuthGuard)
export class BlockchainController {
  constructor(
    private readonly walletLinkingService: WalletLinkingService,
    private readonly onchainTransferService: OnchainTransferService,
    private readonly providerFactory: BlockchainProviderFactory,
    private readonly managedWalletsService: ManagedWalletsService,
    private readonly dataSource: DataSource,
  ) {}

  // ============ WALLET LINKING ============

  /**
   * Bước 1: Yêu cầu liên kết ví — tạo nonce challenge
   * POST /blockchain/wallets/request-link
   */
  @Post('wallets/request-link')
  @ApiOperation({
    summary: 'Yêu cầu liên kết ví',
    description:
      'Tạo nonce challenge. FE cần yêu cầu user ký message này bằng ví (MetaMask/TronLink/Phantom).',
  })
  @ApiSuccessResponse('Nonce challenge tạo thành công')
  @ApiBadRequestResponse('Địa chỉ ví không hợp lệ')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async requestLink(
    @CurrentUser('userId') userId: string,
    @Body() dto: RequestLinkDto,
  ) {
    return this.walletLinkingService.requestLink(userId, dto);
  }

  /**
   * Bước 2: Xác minh chữ ký & tạo liên kết
   * POST /blockchain/wallets/verify-link
   */
  @Post('wallets/verify-link')
  @ApiOperation({
    summary: 'Xác minh liên kết ví',
    description:
      'Gửi chữ ký đã ký từ ví. BE sẽ verify trên blockchain và tạo liên kết.',
  })
  @ApiSuccessResponse('Liên kết ví thành công')
  @ApiBadRequestResponse('Chữ ký không hợp lệ hoặc nonce hết hạn')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async verifyLink(
    @CurrentUser('userId') userId: string,
    @Body() dto: VerifyLinkDto,
  ) {
    return this.walletLinkingService.verifyLink(userId, dto);
  }

  /**
   * Danh sách ví đã liên kết
   * GET /blockchain/wallets
   */
  @Get('wallets')
  @ApiOperation({
    summary: 'Danh sách ví liên kết',
    description: 'Lấy tất cả ví on-chain đã liên kết của user (trừ REVOKED)',
  })
  @ApiSuccessResponse('Danh sách ví liên kết')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getLinkedWallets(@CurrentUser('userId') userId: string) {
    return this.walletLinkingService.getLinkedWallets(userId);
  }

  /**
   * Lấy số dư on-chain của ví liên kết
   * GET /blockchain/wallets/:linkId/balance
   */
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
    return this.walletLinkingService.getLinkedWalletBalance(userId, linkId);
  }

  /**
   * Huỷ liên kết ví
   * DELETE /blockchain/wallets/:linkId
   */
  @Delete('wallets/:linkId')
  @ApiOperation({
    summary: 'Huỷ liên kết ví',
    description: 'Soft delete — đặt status = REVOKED',
  })
  @ApiParam({ name: 'linkId', description: 'ID ví liên kết' })
  @ApiSuccessResponse('Huỷ liên kết thành công')
  @ApiBadRequestResponse('Ví liên kết không tìm thấy')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async unlinkWallet(
    @CurrentUser('userId') userId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.walletLinkingService.unlinkWallet(userId, linkId);
  }

  // ============ NẠP / RÚT TIỀN ============

  /**
   * Lấy địa chỉ nạp tiền theo mạng
   * GET /blockchain/deposit/address
   */
  @Get('deposit/address')
  @ApiOperation({
    summary: 'Lấy địa chỉ nạp tiền theo mạng',
    description:
      'Trả về địa chỉ ví nhận tiền mặc định của platform cho chain được chọn, fallback sang hot wallet nếu chưa cấu hình ví quản lý.',
  })
  @ApiQuery({
    name: 'chain',
    required: true,
    type: String,
    example: 'ETH_SEPOLIA',
  })
  @ApiSuccessResponse('Địa chỉ nạp tiền theo mạng')
  @ApiBadRequestResponse('Thiếu chain hoặc chain không hợp lệ')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getDepositAddress(@Query('chain') chain?: string) {
    if (!chain) {
      throw new BadRequestException('Thiếu query param chain', 'CHAIN_REQUIRED');
    }

    const normalizedChain = chain.toUpperCase() as BlockchainNetwork;
    const provider = this.providerFactory.getProvider(normalizedChain);
    const managedWallet = await this.managedWalletsService.getConfiguredDepositWallet(
      normalizedChain,
    );

    return {
      chain: normalizedChain,
      depositAddress: managedWallet?.address ?? await provider.getHotWalletAddress(),
      source: managedWallet ? 'managed_wallet' : 'hot_wallet',
      note: 'Đây là địa chỉ ví nhận tiền của platform cho mạng đã chọn.',
    };
  }

  /**
   * Preview giao dịch nạp theo txHash
   * GET /blockchain/deposit/preview
   */
  @Get('deposit/preview')
  @ApiOperation({
    summary: 'Preview nạp tiền theo txHash',
    description:
      'Kiểm tra nhanh giao dịch on-chain để FE tự điền amount trước khi submit deposit.',
  })
  @ApiQuery({ name: 'chain', required: true, type: String, example: 'ETH_SEPOLIA' })
  @ApiQuery({ name: 'txHash', required: true, type: String })
  @ApiSuccessResponse('Thông tin preview giao dịch nạp')
  @ApiBadRequestResponse('Thiếu chain/txHash hoặc txHash không hợp lệ')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async previewDeposit(
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
    return this.onchainTransferService.previewDepositTx(
      userId,
      normalizedChain,
      txHash,
    );
  }

  /**
   * Nạp tiền thủ công — submit txHash
   * POST /blockchain/deposit/submit
   */
  @Post('deposit/submit')
  @ApiOperation({
    summary: 'Nạp tiền (submit txHash)',
    description:
      'User gửi coin on-chain rồi submit txHash. BE verify trên blockchain và ghi nhận deposit.',
  })
  @ApiSuccessResponse('Nạp tiền thành công')
  @ApiBadRequestResponse('TxHash không hợp lệ hoặc giao dịch lỗi')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async submitDeposit(
    @CurrentUser('userId') userId: string,
    @Body() dto: SubmitDepositDto,
  ) {
    return this.onchainTransferService.submitDeposit(userId, dto);
  }

  /**
   * Settle nạp tiền theo txId (dùng cho tx đang CONFIRMING)
   * POST /blockchain/deposit/:txId/settle
   */
  @Post('deposit/:txId/settle')
  @ApiOperation({
    summary: 'Settle nạp tiền on-chain',
    description:
      'Re-check trạng thái on-chain và credit wallet ledger khi giao dịch đã CONFIRMED.',
  })
  @ApiParam({ name: 'txId', description: 'ID giao dịch nạp on-chain' })
  @ApiSuccessResponse('Settle nạp tiền thành công')
  @ApiBadRequestResponse('Giao dịch nạp không hợp lệ hoặc chưa confirm')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async settleDeposit(
    @CurrentUser('userId') userId: string,
    @Param('txId') txId: string,
  ) {
    return this.onchainTransferService.settleDepositByTxId(userId, txId);
  }

  /**
   * Yêu cầu rút tiền
   * POST /blockchain/withdraw/request
   */
  @Post('withdraw/request')
  @ApiOperation({
    summary: 'Yêu cầu rút tiền',
    description:
      'Gửi coin từ platform về ví liên kết đã verified. Xử lý async.',
  })
  @ApiSuccessResponse('Yêu cầu rút tiền đã tiếp nhận')
  @ApiBadRequestResponse('Ví chưa xác minh hoặc balance không đủ')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async requestWithdrawal(
    @CurrentUser('userId') userId: string,
    @Body() dto: RequestWithdrawalDto,
  ) {
    return this.onchainTransferService.requestWithdrawal(userId, dto);
  }

  /**
   * Duyệt yêu cầu rút tiền manual
   * POST /blockchain/withdraw/manual/:txId/approve
   */
  @Post('withdraw/manual/:txId/approve')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.RISK_REVIEW)
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
    return this.onchainTransferService.approveManualWithdrawal(actorUserId, txId);
  }

  /**
   * Từ chối yêu cầu rút tiền manual
   * POST /blockchain/withdraw/manual/:txId/reject
   */
  @Post('withdraw/manual/:txId/reject')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.RISK_REVIEW)
  @ApiOperation({
    summary: 'Reject manual withdrawal',
    description:
      'Từ chối yêu cầu manual review và hoàn frozen balance về available.',
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
    return this.onchainTransferService.rejectManualWithdrawal(
      actorUserId,
      txId,
      dto.reason,
    );
  }

  /**
   * Worker endpoint để xử lý hàng chờ manual withdrawal
   * POST /blockchain/withdraw/manual/process-pending?limit=20
   */
  @Post('withdraw/manual/process-pending')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.RISK_REVIEW)
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
    return this.onchainTransferService.processPendingManualWithdrawals(
      actorUserId,
      parsedLimit,
    );
  }

  // ============ LỊCH SỬ GIAO DỊCH ============

  /**
   * Lịch sử giao dịch on-chain
   * GET /blockchain/transactions
   */
  @Get('transactions')
  @ApiOperation({
    summary: 'Lịch sử giao dịch on-chain',
    description: 'Danh sách deposit/withdrawal/transfer on-chain',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiSuccessResponse('Lịch sử giao dịch')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getTransactions(
    @CurrentUser('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.onchainTransferService.getTransactions(userId, parsedLimit);
  }

  /**
   * Chi tiết 1 giao dịch
   * GET /blockchain/transactions/:txId
   */
  @Get('transactions/:txId')
  @ApiOperation({
    summary: 'Chi tiết giao dịch on-chain',
    description: 'Lấy thông tin chi tiết 1 giao dịch',
  })
  @ApiParam({ name: 'txId', description: 'ID giao dịch on-chain' })
  @ApiSuccessResponse('Chi tiết giao dịch')
  @ApiBadRequestResponse('Giao dịch không tìm thấy')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getTransaction(
    @CurrentUser('userId') userId: string,
    @Param('txId') txId: string,
  ) {
    return this.onchainTransferService.getTransactionById(userId, txId);
  }

  // ============ ADMIN ============

  /**
   * Admin: Danh sách tất cả giao dịch rút tiền on-chain
   * GET /blockchain/admin/withdrawals
   */
  @Get('admin/withdrawals')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.RISK_REVIEW)
  @ApiOperation({
    summary: 'Admin: List all withdrawal transactions',
    description: 'Paginated list of all onchain withdrawal transactions across all users.',
  })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED'] })
  @ApiQuery({ name: 'chain', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listAdminWithdrawals(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('chain') chain?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    const qb = this.dataSource
      .getRepository(OnchainTransaction)
      .createQueryBuilder('tx')
      .where('tx.type = :type', { type: 'WITHDRAWAL' })
      .orderBy('tx.created_at', 'DESC');

    if (userId) qb.andWhere('tx.user_id = :userId', { userId });
    if (status) qb.andWhere('tx.status = :status', { status });
    if (chain) qb.andWhere('tx.chain = :chain', { chain });

    const skip = (page - 1) * limit;
    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data: items, total, page, limit };
  }

  // ============ UTILITIES ============

  /**
   * Danh sách mạng blockchain được hỗ trợ
   * GET /blockchain/networks
   */
  @Get('networks')
  @Public()
  @ApiOperation({
    summary: 'Danh sách mạng blockchain',
    description: 'Trả về các mạng testnet được hỗ trợ',
  })
  @ApiSuccessResponse('Danh sách mạng')
  getSupportedNetworks() {
    return {
      networks: this.providerFactory.getSupportedNetworks(),
    };
  }
}
