import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MarketMakerConfig } from '@/entities/market-maker-config.entity';

@Injectable()
export class MarketMakerConfigRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByUser(userId: string): Promise<MarketMakerConfig[]> {
    return this.dataSource.getRepository(MarketMakerConfig).find({
      where: { user_id: userId },
      order: { updated_at: 'DESC' },
    });
  }

  async findByUserPair(userId: string, pairId: string): Promise<MarketMakerConfig | null> {
    return this.dataSource.getRepository(MarketMakerConfig).findOne({
      where: { user_id: userId, pair_id: pairId },
    });
  }

  async save(config: MarketMakerConfig): Promise<MarketMakerConfig> {
    return this.dataSource.getRepository(MarketMakerConfig).save(config);
  }

  async deleteByUserPair(userId: string, pairId: string): Promise<boolean> {
    const result = await this.dataSource.getRepository(MarketMakerConfig).delete({
      user_id: userId,
      pair_id: pairId,
    });
    return Number(result.affected ?? 0) > 0;
  }
}
