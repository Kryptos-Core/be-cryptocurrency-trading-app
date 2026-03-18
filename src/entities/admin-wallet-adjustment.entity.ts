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
import { Currency } from './currency.entity';

@Entity('admin_wallet_adjustments')
@Index('idx_adj_actor', ['actor_user_id'])
@Index('idx_adj_target', ['target_user_id'])
@Index('idx_adj_created', ['created_at'])
export class AdminWalletAdjustment {
  @PrimaryColumn({ type: 'char', length: 36 })
  adjustment_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  actor_user_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  target_user_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Currency)
  currency_id!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'enum', enum: ['DEPOSIT', 'WITHDRAW'] })
  type!: 'DEPOSIT' | 'WITHDRAW';

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  actor!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  target!: User;

  @ManyToOne(() => Currency, { onDelete: 'CASCADE' })
  currency!: Currency;
}
