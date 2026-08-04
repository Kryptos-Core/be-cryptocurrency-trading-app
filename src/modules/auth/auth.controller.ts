import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiSuccessResponse,
  ApiUnauthorizedResponse,
  CurrentUser,
  Public,
} from '@/common/decorators';
import { BadRequestException } from '@/common/exceptions';
import { JwtAuthGuard } from '@/common/guards';
import { isWalletPlaceholderEmail } from '@/common/utils/wallet-placeholder-email.util';
import { AuthService } from './auth.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  TwoFaOtpDto,
  WalletNonceDto,
  WalletVerifyAuthDto,
  WcAuthInitDto,
  WcAuthVerifyDto,
} from './dto';
import { TwoFaService } from './two-fa.service';
import { WalletAuthService } from './wallet-auth.service';
import { WalletConnectAuthService } from './wallet-connect-auth.service';

/**
 * Auth Controller - API Endpoints
 * Áp dụng: Controller Pattern (MVC)
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly walletAuthService: WalletAuthService,
    private readonly walletConnectAuthService: WalletConnectAuthService,
    private readonly twoFaService: TwoFaService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  /**
   * Register new user
   * POST /auth/register
   */
  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register new user',
    description: 'Create a new user account with email and password',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse('User registered successfully', {
    schema: {
      example: {
        success: true,
        message: 'User registered successfully',
        data: {
          user_id: 1,
          email: 'user@example.com',
          first_name: 'John',
          last_name: 'Doe',
          status: 'ACTIVE',
        },
      },
    },
  })
  @ApiBadRequestResponse('Invalid input data')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * Login user
   * POST /auth/login
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticate user and return JWT token',
  })
  @ApiBody({ type: LoginDto })
  @ApiSuccessResponse('Login successful', {
    schema: {
      example: {
        success: true,
        message: 'Login successful',
        data: {
          access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            user_id: 1,
            email: 'user@example.com',
            first_name: 'John',
            last_name: 'Doe',
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse('Invalid credentials')
  @ApiBadRequestResponse('Invalid input data')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * Request nonce for wallet auth (MetaMask / TronLink)
   * POST /auth/wallet-nonce
   */
  @Public()
  @Post('wallet-nonce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request wallet auth nonce',
    description: 'Get a challenge message to sign with MetaMask or TronLink for login/register',
  })
  @ApiBody({ type: WalletNonceDto })
  @ApiSuccessResponse('Nonce challenge created')
  @ApiBadRequestResponse('Invalid chain or address')
  async walletNonce(@Body() dto: WalletNonceDto) {
    return this.walletAuthService.requestNonce(dto.chain, dto.address);
  }

  /**
   * Verify wallet signature and login or register
   * POST /auth/wallet-verify
   */
  @Public()
  @Post('wallet-verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify wallet signature',
    description:
      'Verify signed message and return JWT (login if user exists, register and link wallet if new)',
  })
  @ApiBody({ type: WalletVerifyAuthDto })
  @ApiSuccessResponse('Wallet auth successful', {
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: { user_id: '...', email: '0x1234@eth_sepolia.wallet', status: 'ACTIVE' },
        isNewUser: true,
      },
    },
  })
  @ApiBadRequestResponse('Invalid signature or expired nonce')
  async walletVerify(@Body() dto: WalletVerifyAuthDto) {
    return this.walletAuthService.verifyAndAuthenticate(dto.chain, dto.address, dto.signature);
  }

  /**
   * Khởi tạo session WalletConnect đăng nhập (không cần JWT).
   * POST /auth/wallet/wc/init
   */
  @Public()
  @Post('wallet/wc/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Init WalletConnect login session (public)',
    description:
      'Tạo session Redis + wcUri + message ký. FE poll GET .../status/:sessionId rồi POST .../verify khi đã có chữ ký.',
  })
  @ApiBody({ type: WcAuthInitDto })
  @ApiSuccessResponse('WC auth session created')
  @ApiBadRequestResponse('Invalid chain')
  async wcAuthInit(@Body() dto: WcAuthInitDto) {
    return this.walletConnectAuthService.initSession(dto.chain);
  }

  /**
   * Poll trạng thái session đăng nhập WC (public).
   * GET /auth/wallet/wc/status/:sessionId
   */
  @Public()
  @Get('wallet/wc/status/:sessionId')
  @ApiOperation({
    summary: 'Poll WalletConnect login session status',
    description:
      'Trả về pending/expired và metadata; chữ ký chỉ có khi relay/SDK cập nhật (tùy triển khai).',
  })
  @ApiSuccessResponse('Session status')
  @ApiBadRequestResponse('Invalid session id')
  async wcAuthStatus(@Param('sessionId') sessionId: string) {
    return this.walletConnectAuthService.getSessionStatus(sessionId);
  }

  /**
   * Hoàn tất đăng nhập: xác minh chữ ký với message của session, cấp JWT.
   * POST /auth/wallet/wc/verify
   */
  @Public()
  @Post('wallet/wc/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify WalletConnect login signature',
    description: 'Cùng định dạng phản hồi user/token như POST /auth/wallet-verify',
  })
  @ApiBody({ type: WcAuthVerifyDto })
  @ApiSuccessResponse('Wallet auth successful', {
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: { user_id: '...', email: '0x1234@eth_sepolia.wallet', status: 'ACTIVE' },
        isNewUser: true,
      },
    },
  })
  @ApiBadRequestResponse('Invalid signature or expired session')
  async wcAuthVerify(@Body() dto: WcAuthVerifyDto) {
    return this.walletConnectAuthService.verifySession(
      dto.sessionId,
      dto.chain,
      dto.address,
      dto.signature,
    );
  }

  @Post('2fa/send-otp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Send OTP for 2FA verification',
    description: 'Send 6-digit OTP code to authenticated user email',
  })
  @ApiSuccessResponse('OTP sent successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async sendTwoFaOtp(@CurrentUser('userId') userId: string) {
    const emailVerificationRequired = await this.systemConfigService.isEmailVerificationRequired();
    if (!emailVerificationRequired) {
      throw new BadRequestException(
        'Email verification is disabled by admin. OTP is not required.',
        'EMAIL_VERIFICATION_DISABLED',
      );
    }
    const user = await this.authService.getUserById(userId);
    if (isWalletPlaceholderEmail(user.email)) {
      throw new BadRequestException(
        'Tài khoản đăng nhập bằng ví chưa có email liên hệ thật. Vui lòng thêm email trong Hồ sơ (bảo mật) và chờ duyệt trước khi dùng OTP qua mail.',
        'CONTACT_EMAIL_REQUIRED',
      );
    }
    return this.twoFaService.sendOtp(userId, user.email);
  }

  /**
   * Returns whether email verification (OTP gating) is currently required.
   * Safe to call on every screen for any authenticated user.
   */
  @Get('email-verification-required')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get email verification required flag',
    description:
      'Returns whether OTP email gating is active. When false, all OTP flows are bypassed.',
  })
  @ApiSuccessResponse('Email verification required flag')
  @ApiUnauthorizedResponse('Unauthorized')
  async getEmailVerificationRequired() {
    const required = await this.systemConfigService.isEmailVerificationRequired();
    return { emailVerificationRequired: required };
  }

  /**
   * Check OTP is correct (does not consume). Use so the client can gate UI before
   * change-password / enable / disable / security-change which call verifyOtp().
   */
  @Post('2fa/validate-otp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Validate 2FA OTP (no consume)',
    description:
      'Returns success if the code matches the active OTP. Does not invalidate the code.',
  })
  @ApiBody({ type: TwoFaOtpDto })
  @ApiSuccessResponse('OTP is valid')
  @ApiBadRequestResponse('Invalid or expired OTP')
  @ApiUnauthorizedResponse('Unauthorized')
  async validateTwoFaOtp(@CurrentUser('userId') userId: string, @Body() dto: TwoFaOtpDto) {
    const ok = await this.twoFaService.validateOtpOnly(userId, dto.otpCode);
    if (!ok) {
      throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn', 'INVALID_OTP');
    }
    return { valid: true };
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Enable 2FA',
    description: 'Enable 2FA after verifying OTP',
  })
  @ApiBody({ type: TwoFaOtpDto })
  @ApiSuccessResponse('2FA enabled successfully')
  @ApiBadRequestResponse('Invalid OTP')
  async enableTwoFa(@CurrentUser('userId') userId: string, @Body() dto: TwoFaOtpDto) {
    await this.twoFaService.enable(userId, dto.otpCode);
    return { enabled: true };
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Disable 2FA',
    description: 'Disable 2FA after verifying OTP',
  })
  @ApiBody({ type: TwoFaOtpDto })
  @ApiSuccessResponse('2FA disabled successfully')
  @ApiBadRequestResponse('Invalid OTP')
  async disableTwoFa(@CurrentUser('userId') userId: string, @Body() dto: TwoFaOtpDto) {
    await this.twoFaService.disable(userId, dto.otpCode);
    return { enabled: false };
  }

  /**
   * Change password directly (no admin approval).
   * Requires 2FA OTP verification.
   * POST /auth/change-password
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Change password',
    description: 'Change password with OTP verification (2FA required). No admin approval.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiSuccessResponse('Password changed successfully')
  @ApiBadRequestResponse('Invalid OTP or 2FA not enabled')
  async changePassword(@CurrentUser('userId') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto);
  }

  /**
   * Get current user profile (Protected route)
   * GET /auth/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Get authenticated user profile information',
  })
  @ApiSuccessResponse('User profile retrieved successfully', {
    schema: {
      example: {
        success: true,
        data: {
          user_id: 1,
          email: 'user@example.com',
          first_name: 'John',
          last_name: 'Doe',
          status: 'ACTIVE',
          created_at: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  })
  @ApiUnauthorizedResponse('Unauthorized - Invalid or missing token')
  async getProfile(@CurrentUser('userId') userId: string) {
    return this.authService.getProfile(userId);
  }
}
