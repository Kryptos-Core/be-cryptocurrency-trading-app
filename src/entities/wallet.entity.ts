import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ForeignKey,
  Index,
  OneToMany,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Currency } from './currency.entity';
import { WalletLedger } from './wallet-ledger.entity';

@Entity('wallets')
@Index('uk_wallet_user_currency', ['user_id', 'currency_id'], {
  unique: true,
})
@Index('idx_wallet_user', ['user_id'])
export class Wallet {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  wallet_id!: number;

  @Column({ type: 'bigint' })
  @ForeignKey(() => User)
  user_id!: number;

  @Column({ type: 'int' })
  @ForeignKey(() => Currency)
  currency_id!: number;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  available!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  frozen!: string;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(() => User, (user) => user.wallets, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Currency, (currency) => currency.wallets, {
    onDelete: 'RESTRICT',
  })
  currency!: Currency;

  @OneToMany('WalletLedger', 'wallet')
  ledgers!: any[];
}
