import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './repositories';
import { CloudinaryService } from '@/common/services';
import {
  UpdateUserDto,
  UpdateMyProfileBasicDto,
  RequestSecurityChangeDto,
  ReviewSecurityChangeDto,
} from './dto';
import { User } from '@/entities/user.entity';
import { NotFoundException, ConflictException, BadRequestException } from '@/common/exceptions';
import { newUuid } from '@/common/utils/uuid.util';

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
  ) {}

  /**
   * Find all users with pagination
   */
  async findAll(page: number = 1, limit: number = 10): Promise<{ users: User[]; total: number }> {
    return this.usersRepository.findAll(page, limit);
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
      const emailExists = await this.usersRepository.emailExists(
        updateUserDto.email,
        userId,
      );
      if (emailExists) {
        throw new ConflictException('Email already exists', 'EMAIL_EXISTS');
      }
    }

    // Update user via repository
    await this.usersRepository.update(userId, updateUserDto);

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
  async updateProfileBasic(
    userId: string,
    dto: UpdateMyProfileBasicDto,
  ): Promise<User> {
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
    await this.findOne(userId);

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
      const password = payload.password as string | undefined;
      if (!password || typeof password !== 'string' || password.length < 8) {
        throw new BadRequestException(
          'Payload must contain password (min 8 characters)',
          'INVALID_PAYLOAD',
        );
      }
      const passwordHash = await bcrypt.hash(password, 10);
      payload = { password_hash: passwordHash };
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
      throw new NotFoundException('Security change request not found or already reviewed', requestId);
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

    const { url, publicId } = await this.cloudinaryService.upload(
      buffer,
      userId.slice(0, 8),
    );

    if (user.avatar_public_id) {
      await this.cloudinaryService.destroy(user.avatar_public_id);
    }

    await this.usersRepository.updateAvatar(userId, url, publicId);
    this.logger.log(`Avatar updated for user ${userId}`);
    return this.findOne(userId);
  }
}
