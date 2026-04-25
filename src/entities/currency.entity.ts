import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
import { DECIMAL_36_18_DEFAULT_0_COLUMN } from '@/common/constants/column-types';
import { CurrencyNetwork } from './currency-network.entity';
import { MarketPair } from './market-pair.entity';

@Entity('currencies')
@Index('uk_currency_symbol', ['symbol'], { unique: true })
export class Currency {
  @PrimaryColumn({ type: 'char', length: 36 })
  currency_id!: string;

  @Column({ type: 'varchar', length: 16, unique: true })
  symbol!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'smallint', default: 8 })
  precision_scale!: number;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  min_withdraw!: string;

  @Column({ type: 'boolean', default: true })
  is_tradable!: boolean;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @OneToMany(() => MarketPair, (pair) => pair.base_currency)
  base_pairs!: MarketPair[];

  @OneToMany(() => MarketPair, (pair) => pair.quote_currency)
  quote_pairs!: MarketPair[];

  @OneToMany('Wallet', 'currency')
  wallets!: unknown[];

  @OneToMany('WalletLedger', 'currency')
  wallet_ledgers!: unknown[];

  @OneToMany(() => CurrencyNetwork, (network) => network.currency)
  networks!: CurrencyNetwork[];

  @OneToMany('Deposit', 'currency')
  deposits!: unknown[];

  @OneToMany('Withdrawal', 'currency')
  withdrawals!: unknown[];

  @OneToMany('Trade', 'fee_currency')
  trades!: unknown[];

  lastPrice?: string;
  priceChangePercent24h?: string;
  volume24h?: string;
}
