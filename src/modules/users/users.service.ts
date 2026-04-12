import { Injectable, Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@/common/exceptions';
import type { CloudinaryService } from '@/common/services';
import { newUuid } from '@/common/utils/uuid.util';
import { isWalletPlaceholderEmail } from '@/common/utils/wallet-placeholder-email.util';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import type { User } from '@/entities/user.entity';
import type { TwoFaService } from '@/modules/auth/two-fa.service';
import type { OrderRepository } from '@/modules/orders/repositories';
import type { WalletsService } from '@/modules/wallets/wallets.service';
import type {
  RequestSecurityChangeDto,
  ReviewSecurityChangeDto,
  UpdateMyProfileBasicDto,
  UpdateUserDto,
  UserFilterDto,
} from './dto';
import type { UsersRepository } from './repositories';

/**
 * Users Service - Business Logic Layer
 * Chỉ chứa business logic
 * Gọi UsersRepository để access database thông qua stored procedures
 *
 * Áp dụng:
 * - Single Responsibility Principle: Chỉ xử lý user business logic
 * - Dependency Inversion: Phụ thuộc vào Repository abstraction
 * - Repository Pattern: Tách riêng data access
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly cloudinaryService: CloudinaryService,
    private readonly twoFaService: TwoFaService,
    private readonly walletsService: WalletsService,
    private readonly dataSource: DataSource,
    private readonly orderRepository: OrderRepository,
  ) {}

  /**
   * Find all users with optional search/filter/sort (admin)
   */
  async findAll(
    filters: UserFilterDto,
  ): Promise<{ users: User[]; total: number; page: number; limit: number }> {
    return this.usersRepository.findAllWithFilters(filters);
  }

  /**
   * Get wallet balances for a specific user (admin/risk officer)
   */
  async getUserWallets(userId: string) {
    await this.findOne(userId);
    return this.walletsService.getWallets(userId, true);
  }

  /**
   * Get onchain transactions for a specific user (admin/risk officer)
   */
  async getUserOnchainTransactions(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ items: OnchainTransaction[]; total: number; page: number; limit: number }> {
    await this.findOne(userId);
    const skip = (page - 1) * limit;
    const [items, total] = await this.dataSource
      .getRepository(OnchainTransaction)
      .createQueryBuilder('tx')
      .where('tx.user_id = :userId', { userId })
      .orderBy('tx.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    return { items, total, page, limit };
  }

  /**
   * Get security change request history for a specific user (admin/risk officer)
   */
  async getUserSecurityChanges(userId: string, page: number = 1, limit: number = 20) {
    await this.findOne(userId);
    return this.usersRepository.findSecurityChangesByUserId(userId, page, limit);
  }

  /**
   * Get order history for a specific user (admin view)
   */
  async getUserOrders(userId: string, page: number = 1, limit: number = 20, status?: string) {
    await this.findOne(userId);
    return this.orderRepository.findByUserForAdmin(userId, (page - 1) * limit, limit, status);
  }

  /**
   * Find user by ID (UUID string)
   */
  async findOne(userId: string): Promise<User> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User', userId);
    }

    return user;
  }

  /**
   * Find user by email (used in auth)
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  /**
   * Create new user
   */
  async create(email: string, passwordHash: string): Promise<User> {
    // Check if email already exists
    const existingUser = await this.usersRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already exists', 'EMAIL_EXISTS');
    }

    return this.usersRepository.create(email, passwordHash);
  }

  /**
   * Update user
   */
  async update(userId: string, updateUserDto: UpdateUserDto): Promise<User> {
    // Verify user exists
    const user = await this.findOne(userId);

    // Check if new email already exists (if email is being updated)
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const emailExists = await this.usersRepository.emailExists(updateUserDto.email, userId);
      if (emailExists) {
        throw new ConflictException('Email already exists', 'EMAIL_EXISTS');
      }
    }

    // Update user via repository
    await this.usersRepository.update(userId, {
      email: updateUserDto.email,
      status: updateUserDto.status,
      role: updateUserDto.role,
      identityVerified: updateUserDto.identityVerified,
    });

    // Fetch and return updated user
    return this.findOne(userId);
  }

  /**
   * Delete user (soft delete)
   */
  async remove(userId: string): Promise<void> {
    // Verify user exists
    await this.findOne(userId);

    // Delete (soft delete via procedure)
    await this.usersRepository.delete(userId);
  }

  /**
   * Get user statistics
   */
  async getStatistics(): Promise<{
    total: number;
    active: number;
    banned: number;
    pending: number;
  }> {
    return this.usersRepository.getStatistics();
  }

  /**
   * Update current user profile basic (first_name, last_name) — no approval needed
   */
  async updateProfileBasic(userId: string, dto: UpdateMyProfileBasicDto): Promise<User> {
    await this.findOne(userId);
    const affected = await this.usersRepository.updateProfileBasic(
      userId,
      dto.firstName ?? null,
      dto.lastName ?? null,
    );
    if (affected === 0) {
      this.logger.warn(`updateProfileBasic no rows updated: ${userId}`);
    }
    return this.findOne(userId);
  }

  /**
   * Create a security change request (PENDING). Requires reviewer to approve.
   */
  async requestSecurityChange(
    userId: string,
    dto: RequestSecurityChangeDto,
  ): Promise<{ requestId: string; status: string }> {
    const user = await this.findOne(userId);

    if (isWalletPlaceholderEmail(user.email) && dto.changeType === 'EMAIL_CHANGE') {
      throw new BadRequestException(
        'Tài khoản ví dùng email tạm. Vui lòng xác minh email thật trong Hồ sơ: nhập địa chỉ mới và nhập OTP được gửi tới email đó.',
        'USE_CONTACT_EMAIL_VERIFICATION',
      );
    }

    // Chỉ cho phép gửi yêu cầu thay đổi thông tin nhạy cảm khi đã bật 2FA
    if (user.two_fa_enabled !== 1) {
      throw new BadRequestException(
        'Vui lòng bật xác thực hai bước trong Cài đặt trước khi thay đổi email hoặc mật khẩu.',
        'TWO_FA_REQUIRED',
      );
    }

    if (!dto.otpCode) {
      throw new BadRequestException('OTP code is required when 2FA is enabled', 'OTP_REQUIRED');
    }
    const otpValid = await this.twoFaService.verifyOtp(userId, dto.otpCode);
    if (!otpValid) {
      throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn', 'INVALID_OTP');
    }

    let payload: Record<string, unknown> = { ...dto.payload };

    if (dto.changeType === 'EMAIL_CHANGE') {
      const email = payload.email as string | undefined;
      if (!email || typeof email !== 'string') {
        throw new BadRequestException('Payload must contain email', 'INVALID_PAYLOAD');
      }
      const emailLower = email.toLowerCase().trim();
      const exists = await this.usersRepository.emailExists(emailLower, userId);
      if (exists) {
        throw new ConflictException('Email already in use', 'EMAIL_EXISTS');
      }
      payload = { email: emailLower };
    } else if (dto.changeType === 'PASSWORD_CHANGE') {
      throw new BadRequestException(
        'Đổi mật khẩu không cần xét duyệt. Vui lòng dùng chức năng Đổi mật khẩu trong Cài đặt.',
        'USE_CHANGE_PASSWORD_ENDPOINT',
      );
    } else {
      throw new BadRequestException('Unsupported change type', 'INVALID_CHANGE_TYPE');
    }

    const requestId = newUuid();
    await this.usersRepository.createSecurityChangeRequest(
      requestId,
      userId,
      dto.changeType,
      payload,
    );
    this.logger.log(`Security change request created: ${requestId}, user=${userId}`);
    return { requestId, status: 'PENDING' };
  }

  /**
   * List PENDING security change requests (for reviewers)
   */
  async getPendingSecurityChangeRequests(): Promise<
    Array<{
      requestId: string;
      userId: string;
      changeType: string;
      payloadJson: string;
      requestedAt: Date;
      userEmail: string;
      firstName: string | null;
      lastName: string | null;
    }>
  > {
    const rows = await this.usersRepository.findPendingSecurityChangeRequests();
    return rows.map((r) => ({
      requestId: r.request_id,
      userId: r.user_id,
      changeType: r.change_type,
      payloadJson: r.payload_json,
      requestedAt: r.requested_at,
      userEmail: r.user_email,
      firstName: r.first_name,
      lastName: r.last_name,
    }));
  }

  /**
   * Approve or reject a security change request (reviewer only)
   */
  async reviewSecurityChangeRequest(
    requestId: string,
    reviewerUserId: string,
    dto: ReviewSecurityChangeDto,
  ): Promise<{ requestId: string; userId: string; status: string }> {
    const result = await this.usersRepository.reviewSecurityChangeRequest(
      requestId,
      reviewerUserId,
      dto.approve,
      dto.reviewNote ?? null,
    );
    if (!result) {
      throw new NotFoundException(
        'Security change request not found or already reviewed',
        requestId,
      );
    }
    return {
      requestId: result.request_id,
      userId: result.user_id,
      status: result.status,
    };
  }

  /**
   * Update user avatar URL (called after Cloudinary upload)
   */
  async updateAvatar(
    userId: string,
    avatarUrl: string | null,
    avatarPublicId: string | null,
  ): Promise<User> {
    await this.findOne(userId);
    await this.usersRepository.updateAvatar(userId, avatarUrl, avatarPublicId);
    return this.findOne(userId);
  }

  /**
   * Upload avatar image to Cloudinary and update user record. Deletes previous avatar if any.
   */
  async uploadAvatar(userId: string, buffer: Buffer): Promise<User> {
    const user = await this.findOne(userId);

    if (!this.cloudinaryService.isConfigured()) {
      throw new BadRequestException(
        'Avatar upload is not configured (Cloudinary). Contact administrator.',
        'AVATAR_UPLOAD_DISABLED',
      );
    }

    const { url, publicId } = await this.cloudinaryService.upload(buffer, userId.slice(0, 8));

    if (user.avatar_public_id) {
      await this.cloudinaryService.destroy(user.avatar_public_id);
    }

    await this.usersRepository.updateAvatar(userId, url, publicId);
    this.logger.log(`Avatar updated for user ${userId}`);
    return this.findOne(userId);
  }

  /**
   * Register or clear FCM device token for push notifications
   */
  async saveFcmToken(userId: string, fcmToken: string | null): Promise<void> {
    await this.usersRepository.saveFcmToken(userId, fcmToken);
  }
}
