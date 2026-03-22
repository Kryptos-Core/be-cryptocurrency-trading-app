import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { MarketMakerConfig } from '@/entities/market-maker-config.entity';

@Injectable()
export class MarketMakerConfigRepository extends BaseRepository<MarketMakerConfig> {
  constructor(dataSource: DataSource) {
    super(MarketMakerConfig, dataSource);
  }

  async findByUser(userId: string): Promise<MarketMakerConfig[]> {
    return this.repository.find({
      where: { user_id: userId },
      order: { updated_at: 'DESC' },
    });
  }

  async findByUserPair(userId: string, pairId: string): Promise<MarketMakerConfig | null> {
    return this.repository.findOne({
      where: { user_id: userId, pair_id: pairId },
    });
  }

  async deleteByUserPair(userId: string, pairId: string): Promise<boolean> {
    const result = await this.repository.delete({
      user_id: userId,
      pair_id: pairId,
    });
    return Number(result.affected ?? 0) > 0;
  }
}
