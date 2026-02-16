import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';
import { Public, CurrentUser } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiCreatedResponse,
} from '@/common/decorators';

/**
 * Auth Controller - API Endpoints
 * Áp dụng: Controller Pattern (MVC)
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
