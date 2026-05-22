import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBinanceCredentials } from '@/entities/user-binance-credentials.entity';

@Injectable()
export class UserBinanceCredentialsRepository {
  constructor(
    @InjectRepository(UserBinanceCredentials)
    private readonly repo: Repository<UserBinanceCredentials>,
  ) {}

  async findByUserId(userId: string): Promise<UserBinanceCredentials[]> {
    return this.repo.find({ where: { user_id: userId }, order: { created_at: 'DESC' } });
  }

  async findByIdAndUserId(id: string, userId: string): Promise<UserBinanceCredentials | null> {
    return this.repo.findOne({ where: { id, user_id: userId } });
  }

  async findActiveByIdAndUserId(id: string, userId: string): Promise<UserBinanceCredentials | null> {
    return this.repo.findOne({ where: { id, user_id: userId, is_active: true } });
  }

  async create(data: {
    userId: string;
    credentialsEncrypted: string;
    label: string | null;
    permissions: string[];
    testnet: boolean;
  }): Promise<UserBinanceCredentials> {
    const entity = this.repo.create({
      user_id: data.userId,
      credentials_encrypted: data.credentialsEncrypted,
      label: data.label,
      permissions: data.permissions,
      testnet: data.testnet,
      is_active: true,
    });
    return this.repo.save(entity);
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.repo.update(id, { last_used_at: new Date() });
  }

  async softDelete(id: string, userId: string): Promise<void> {
    await this.repo.update({ id, user_id: userId }, { is_active: false });
  }
}
