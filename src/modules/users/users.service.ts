import { Injectable, Logger } from '@nestjs/common';
import { UsersRepository } from './repositories';
import { UpdateUserDto } from './dto';
import { User } from '@/entities/user.entity';
import { NotFoundException, ConflictException } from '@/common/exceptions';

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

  constructor(private readonly usersRepository: UsersRepository) {}

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
}
