import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserSession } from './user-session.entity';
import { Withdrawal } from './withdrawal.entity';
import { ManagedWallet } from './managed-wallet.entity';

@Entity('users')
@Index('uk_users_email', ['email'], { unique: true })
export class User {
  @PrimaryColumn({ type: 'char', length: 36 })
  user_id!: string;

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

  @Column({
    type: 'enum',
    enum: [
      'GUEST',
      'TRADER',
      'VERIFIED_USER',
      'ADMIN',
      'RISK_OFFICER',
      'SUPPORT_AGENT',
      'MARKET_MAKER',
    ],
    default: 'TRADER',
  })
  role!:
    | 'GUEST'
    | 'TRADER'
    | 'VERIFIED_USER'
    | 'ADMIN'
    | 'RISK_OFFICER'
    | 'SUPPORT_AGENT'
    | 'MARKET_MAKER';

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatar_url!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar_public_id!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  fcm_token!: string | null;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  two_fa_enabled!: number;

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

  @OneToMany('LinkedWallet', 'user')
  linked_wallets!: any[];

  @OneToMany('OnchainTransaction', 'user')
  onchain_transactions!: any[];

  @OneToMany(() => ManagedWallet, (managedWallet) => managedWallet.user)
  managed_wallets!: ManagedWallet[];
}
