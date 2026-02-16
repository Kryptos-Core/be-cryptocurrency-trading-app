import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  ForeignKey,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { MarketPair } from './market-pair.entity';

@Entity('price_alerts')
@Index('idx_alert_user', ['user_id', 'is_active'])
@Index('idx_alert_pair', ['pair_id', 'is_active'])
export class PriceAlert {
  @PrimaryColumn({ type: 'char', length: 36 })
  alert_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => MarketPair)
  pair_id!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  target_price!: string;

  @Column({ type: 'enum', enum: ['ABOVE', 'BELOW'] })
  direction!: 'ABOVE' | 'BELOW';

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'datetime', nullable: true })
  triggered_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => User, (user) => user.price_alerts, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => MarketPair, (pair) => pair.price_alerts, {
    onDelete: 'CASCADE',
  })
  pair!: MarketPair;
}
