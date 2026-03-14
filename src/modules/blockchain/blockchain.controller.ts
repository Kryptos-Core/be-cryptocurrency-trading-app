import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
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
import { JwtAuthGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@/common/decorators';
import { WalletLinkingService } from './wallet-linking.service';
import { OnchainTransferService } from './onchain-transfer.service';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import {
  RequestLinkDto,
  VerifyLinkDto,
  SubmitDepositDto,
  RequestWithdrawalDto,
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

  // ============ UTILITIES ============

  /**
   * Danh sách mạng blockchain được hỗ trợ
   * GET /blockchain/networks
   */
  @Get('networks')
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
