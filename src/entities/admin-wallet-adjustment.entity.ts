import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { DECIMAL_36_18_COLUMN } from '@/common/constants/column-types';
import { Currency } from './currency.entity';
import { User } from './user.entity';

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

  @Column({ ...DECIMAL_36_18_COLUMN })
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
