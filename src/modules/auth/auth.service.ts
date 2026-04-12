import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { getPermissionsForRole } from '@/common/authz/rbac-policy';
import { normalizeUserRole } from '@/common/authz/user-role.util';
import type { Permission } from '@/common/enums';
import {
  BadRequestException,
  BusinessException,
  ConflictException,
  UnauthorizedException,
} from '@/common/exceptions';
import { formatName } from '@/common/utils/name.util';
import type { User } from '@/entities/user.entity';
import { UsersRepository } from '@/modules/users/repositories';
import type { ChangePasswordDto, LoginDto, RegisterDto } from './dto';
import { AuthRepository } from './repositories';
import { TwoFaService } from './two-fa.service';

/**
 * Auth Service - Business Logic Layer
 * Gọi UsersRepository cho user CRUD/auth lookups và AuthRepository cho auth-specific updates
 * Áp dụng:
 * - Single Responsibility Principle (SRP): Chỉ xử lý authentication logic
 * - Dependency Inversion Principle (DIP): Phụ thuộc vào Repository abstraction
 * - Repository Pattern + Database Procedure Pattern
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    readonly _configService: ConfigService,
    private readonly twoFaService: TwoFaService,
  ) {}

  /**
   * Register new user
   * Applies Name Formatting Pattern for data consistency
   */
  async register(registerDto: RegisterDto): Promise<{ accessToken: string; user: Partial<User> }> {
    const { email, password, firstName, lastName } = registerDto;

    // Check if user already exists via repository
    const emailExists = await this.usersRepository.emailExists(email);
    if (emailExists) {
      throw new ConflictException('Email already exists', 'EMAIL_EXISTS');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Format names for consistency (capitalize, sanitize)
    const formattedFirstName = formatName(firstName);
    const formattedLastName = formatName(lastName);

    // Create user via repository (stored procedure)
    const user = await this.usersRepository.createUser(
      email,
      passwordHash,
      formattedFirstName,
      formattedLastName,
    );

    this.logger.log(`New user registered: ${email}`);

    // Generate JWT token
    const accessToken = this.generateAccessToken(user);

    return {
      accessToken,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Login user
   */
  async login(loginDto: LoginDto): Promise<{ accessToken: string; user: Partial<User> }> {
    const { email, password } = loginDto;

    // Find user via repository (stored procedure)
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is banned
    if (user.status === 'BANNED') {
      throw new BusinessException('Account has been banned', 'ACCOUNT_BANNED');
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${email}`);

    // Generate JWT token
    const accessToken = this.generateAccessToken(user);

    return {
      accessToken,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Get user profile by ID
   */
  async getProfile(_userId: string): Promise<Partial<User>> {
    // Note: This would also use a repository method if needed
    // For now, service handles the error, repository would be called if we had this in repo
    throw new UnauthorizedException('User profile endpoint should be called from users service');
  }

  async getUserById(userId: string): Promise<User> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  /**
   * Change password directly (no admin approval).
   * Requires 2FA OTP verification.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ success: boolean }> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.two_fa_enabled !== 1) {
      throw new BadRequestException(
        'Vui lòng bật xác thực hai bước trong Cài đặt trước khi đổi mật khẩu.',
        'TWO_FA_REQUIRED',
      );
    }

    const otpValid = await this.twoFaService.verifyOtp(userId, dto.otpCode);
    if (!otpValid) {
      throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn', 'INVALID_OTP');
    }

    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.authRepository.updatePassword(userId, passwordHash);

    this.logger.log(`Password changed for user=${userId}`);
    return { success: true };
  }

  /**
   * Hash password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT access token
   */
  private generateAccessToken(user: User): string {
    const role = normalizeUserRole(user.role as string);
    const permissions = getPermissionsForRole(role) as Permission[];
    const identityVerified = user.identity_verified === 1;
    const emailVerified = user.email_verified === 1;

    const payload = {
      userId: user.user_id,
      email: user.email,
      role,
      identityVerified,
      emailVerified,
      permissions,
      sub: user.user_id, // Keep for compatibility
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: User): Partial<User> {
    const { password_hash, two_fa_secret, ...sanitized } = user;
    return sanitized;
  }
}
