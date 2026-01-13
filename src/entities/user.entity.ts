import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserSession } from './user-session.entity';
import { Withdrawal } from './withdrawal.entity';

@Entity('users')
@Index('uk_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  user_id!: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  password_hash!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  first_name!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  last_name!: string;

  @Column({ type: 'varbinary', nullable: true })
  two_fa_secret!: Buffer;

  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'BANNED', 'PENDING'],
    default: 'ACTIVE',
  })
  status!: 'ACTIVE' | 'BANNED' | 'PENDING';

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => UserSession, (session) => session.user)
  sessions!: UserSession[];

  @OneToMany('Wallet', 'user')
  wallets!: any[];

  @OneToMany('Order', 'user')
  orders!: any[];

  @OneToMany('Deposit', 'user')
  deposits!: any[];

  @OneToMany('Withdrawal', 'user')
  withdrawals!: any[];

  @OneToMany('WalletLedger', 'user')
  wallet_ledgers!: any[];

  @OneToMany('PriceAlert', 'user')
  price_alerts!: any[];
}
