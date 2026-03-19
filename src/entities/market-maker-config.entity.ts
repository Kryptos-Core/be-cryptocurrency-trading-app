import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  ForeignKey,
} from 'typeorm';
import { User } from './user.entity';
import { MarketPair } from './market-pair.entity';

@Entity('market_maker_configs')
@Index('uk_mm_cfg_user_pair', ['user_id', 'pair_id'], { unique: true })
@Index('idx_mm_cfg_active', ['is_active'])
export class MarketMakerConfig {
  @PrimaryColumn({ type: 'char', length: 36 })
  config_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => MarketPair)
  pair_id!: string;

  @Column({ type: 'int', unsigned: true })
  spread_bps!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  spread_alert_threshold_bps!: number;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  order_amount!: string;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  stop_loss_pct!: string | null;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  max_position_base!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => MarketPair, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pair_id' })
  pair!: MarketPair;
}
