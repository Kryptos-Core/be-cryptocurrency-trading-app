import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ApiBadRequestResponse,
  ApiSuccessResponse,
  ApiUnauthorizedResponse,
  CurrentUser,
  Public,
} from '@/common/decorators';
import type { BlockchainNetwork } from '@/common/enums';
import { JwtAuthGuard } from '@/common/guards';
import type { WcInitDto } from './dto';
import { WalletConnectService } from './wallet-connect.service';

/**
 * WalletConnect Controller
 *
 * Endpoints:
 *  POST /blockchain/wallets/wc/init           - Tạo WC session URI (QR content)
 *  GET  /blockchain/wallets/wc/status/:sid    - Poll trạng thái session
 *  POST /blockchain/wallets/wc/submit         - FE submit signature sau khi WC signing
 *  POST /blockchain/wallets/wc/relay-webhook  - Nhận callback từ WC relay (Public)
 */
@ApiTags('blockchain')
@ApiBearerAuth('JWT-auth')
@Controller('blockchain/wallets/wc')
@UseGuards(JwtAuthGuard)
export class WalletConnectController {
  constructor(private readonly walletConnectService: WalletConnectService) {}

  /**
   * Bước 1: Tạo WalletConnect session
   * FE dùng wcUri để hiển thị QR Code hoặc tạo deep link
   * POST /blockchain/wallets/wc/init
   */
  @Post('init')
  @ApiOperation({
    summary: 'Tạo WalletConnect session URI',
    description:
      'Tạo WC session URI. FE dùng URI này để hiển thị QR Code (Windows/Desktop) hoặc deep link (Mobile). ' +
      'Wallet user (Trust Wallet, MetaMask Mobile...) scan QR hoặc bấm deep link để kết nối.',
  })
  @ApiSuccessResponse('WC session URI tạo thành công')
  @ApiBadRequestResponse('Chain không được hỗ trợ qua WalletConnect')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async initSession(@CurrentUser('userId') userId: string, @Body() dto: WcInitDto) {
    return this.walletConnectService.initSession(userId, dto.chain);
  }

  /**
   * Bước 2: Kiểm tra trạng thái session
   * FE poll endpoint này mỗi 2s để biết khi nào user đã scan + ký
   * GET /blockchain/wallets/wc/status/:sessionId
   */
  @Get('status/:sessionId')
  @ApiOperation({
    summary: 'Trạng thái WalletConnect session',
    description:
      'FE poll mỗi 2 giây. Khi status = "signed", FE gọi POST /wc/submit để hoàn tất liên kết.',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID từ /wc/init' })
  @ApiSuccessResponse('Trạng thái session')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async getSessionStatus(
    @CurrentUser('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.walletConnectService.getSessionStatus(userId, sessionId);
  }

  /**
   * Bước 3: FE submit signature sau khi WalletConnect signing hoàn tất
   * FE nhận được signature từ walletconnect_flutter_v2 SDK event listener
   * rồi gửi lên BE để verify + tạo linked_wallet
   * POST /blockchain/wallets/wc/submit
   */
  @Post('submit')
  @ApiOperation({
    summary: 'Submit signature từ WalletConnect',
    description:
      'Sau khi WC signing hoàn tất trên wallet, FE gửi signature + address lên BE. ' +
      'BE verify on-chain và tạo liên kết ví nếu hợp lệ.',
  })
  @ApiSuccessResponse('Liên kết ví qua WalletConnect thành công')
  @ApiBadRequestResponse('Session hết hạn hoặc signature không hợp lệ')
  @ApiUnauthorizedResponse('Chưa đăng nhập')
  async submitSignature(
    @CurrentUser('userId') userId: string,
    @Body()
    dto: {
      sessionId: string;
      address: string;
      signature: string;
      chain: BlockchainNetwork;
    },
  ) {
    return this.walletConnectService.submitSignature(
      userId,
      dto.sessionId,
      dto.address,
      dto.signature,
      dto.chain,
    );
  }

  /**
   * Relay Webhook: WalletConnect relay server gọi vào đây khi có session event
   * Endpoint này là Public nhưng được bảo vệ bằng HMAC signature verify
   * POST /blockchain/wallets/wc/relay-webhook
   *
   * Đăng ký webhook với relay qua irn_watchRegister sau khi server start
   */
  @Post('relay-webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Webhook] WalletConnect Relay callback',
    description:
      'Endpoint nhận push notification từ WalletConnect Relay Server. ' +
      'Không cần Authentication, nhưng verify HMAC-SHA256 từ header X-WC-Signature.',
  })
  async handleRelayWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-wc-signature') wcSignature?: string,
    @Headers('x-relay-signature') relaySignature?: string,
  ) {
    const signature = wcSignature ?? relaySignature;
    return this.walletConnectService.handleRelayWebhook(payload, signature);
  }
}
