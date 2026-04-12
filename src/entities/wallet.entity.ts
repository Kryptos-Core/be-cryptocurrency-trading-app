import {
  Column,
  Entity,
  ForeignKey,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Currency } from './currency.entity';
import { User } from './user.entity';

@Entity('wallets')
@Index('uk_wallet_user_currency', ['user_id', 'currency_id'], {
  unique: true,
})
@Index('idx_wallet_user', ['user_id'])
export class Wallet {
  @PrimaryColumn({ type: 'char', length: 36 })
  wallet_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Currency)
  currency_id!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  available!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  frozen!: string;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(
    () => User,
    (user) => user.wallets,
    { onDelete: 'CASCADE' },
  )
  user!: User;

  @ManyToOne(
    () => Currency,
    (currency) => currency.wallets,
    {
      onDelete: 'RESTRICT',
    },
  )
  currency!: Currency;

  @OneToMany('WalletLedger', 'wallet')
  ledgers!: any[];
}
