import type { MarketMakerConfig } from '@/entities/market-maker-config.entity';

export interface MarketMakerConfigRepositoryPort {
  findByUser(userId: string): Promise<MarketMakerConfig[]>;
  findByUserPair(userId: string, pairId: string): Promise<MarketMakerConfig | null>;
  save(entity: Partial<MarketMakerConfig>): Promise<MarketMakerConfig>;
  deleteByUserPair(userId: string, pairId: string): Promise<boolean>;
}
