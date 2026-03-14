import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('fiat_deposits')
@Index('idx_fiat_deposits_user', ['user_id'])
@Index('idx_fiat_deposits_order_code', ['order_code'], { unique: true })
export class FiatDeposit {
  @PrimaryColumn({ type: 'char', length: 36 })
  deposit_id!: string;

  @Column({ type: 'char', length: 36 })
  user_id!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'PAID', 'CANCELLED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'PAID' | 'CANCELLED';

  @Column({ type: 'bigint', unique: true })
  order_code!: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  checkout_url!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
