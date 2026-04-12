import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
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

  @Column({ type: 'tinyint', default: 8 })
  precision_scale!: number;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  min_withdraw!: string;

  @Column({ type: 'boolean', default: true })
  is_tradable!: boolean;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @OneToMany(
    () => MarketPair,
    (pair) => pair.base_currency,
  )
  base_pairs!: MarketPair[];

  @OneToMany(
    () => MarketPair,
    (pair) => pair.quote_currency,
  )
  quote_pairs!: MarketPair[];

  @OneToMany('Wallet', 'currency')
  wallets!: any[];

  @OneToMany('WalletLedger', 'currency')
  wallet_ledgers!: any[];

  @OneToMany(
    () => CurrencyNetwork,
    (network) => network.currency,
  )
  networks!: CurrencyNetwork[];

  @OneToMany('Deposit', 'currency')
  deposits!: any[];

  @OneToMany('Withdrawal', 'currency')
  withdrawals!: any[];

  @OneToMany('Trade', 'fee_currency')
  trades!: any[];

  // ------------------------------------------------------------------------
  // Thêm các thuộc tính ảo (Virtual properties) để map thêm Market Data trả về API
  // ------------------------------------------------------------------------
  lastPrice?: string;
  priceChangePercent24h?: string;
  volume24h?: string;
}
