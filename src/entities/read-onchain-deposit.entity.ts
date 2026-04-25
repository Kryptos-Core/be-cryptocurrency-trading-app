import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import {
  DECIMAL_36_18_COLUMN,
  DECIMAL_36_18_NULLABLE_COLUMN,
} from '@/common/constants/column-types';

@Entity('read_onchain_deposits')
@Index('idx_read_onchain_deposits_user_created', ['user_id', 'created_at'])
export class ReadOnchainDeposit {
  @PrimaryColumn({ type: 'char', length: 36 })
  tx_id!: string;

  @Column({ type: 'char', length: 36 })
  user_id!: string;

  @Column({ type: 'varchar', length: 64 })
  chain!: string;

  @Column({ type: 'varchar', length: 32, default: 'DEPOSIT' })
  type!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tx_hash!: string | null;

  @Column({ type: 'varchar', length: 255, default: '' })
  from_address!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  to_address!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  amount!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'int', default: 0 })
  confirmations!: number;

  @Column({ type: 'boolean', default: false })
  settled!: boolean;

  @Column({ type: 'char', length: 36, nullable: true })
  credited_currency_id!: string | null;

  @Column({ ...DECIMAL_36_18_NULLABLE_COLUMN })
  credited_amount!: string | null;

  @Column({ ...DECIMAL_36_18_NULLABLE_COLUMN })
  conversion_rate!: string | null;

  @Column({ type: 'timestamp', precision: 6 })
  created_at!: Date;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  confirmed_at!: Date | null;

  @Column({ type: 'char', length: 36 })
  last_outbox_id!: string;

  @UpdateDateColumn({ type: 'timestamp', precision: 6 })
  updated_at!: Date;
}
