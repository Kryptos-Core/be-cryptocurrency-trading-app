import {
  Entity,
  PrimaryGeneratedColumn,
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
  @PrimaryGeneratedColumn({ type: 'bigint' })
  alert_id!: number;

  @Column({ type: 'bigint' })
  @ForeignKey(() => User)
  user_id!: number;

  @Column({ type: 'int' })
  @ForeignKey(() => MarketPair)
  pair_id!: number;

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
