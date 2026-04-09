import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  ForeignKey,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { BLOCKCHAIN_CHAIN_DB_VALUES } from '@/common/constants/blockchain-chain-db';

@Entity('linked_wallets')
@Index('uk_linked_wallet_user_chain_addr', ['user_id', 'chain', 'address'], {
  unique: true,
})
@Index('idx_linked_wallet_user', ['user_id', 'status'])
export class LinkedWallet {
  @PrimaryColumn({ type: 'char', length: 36 })
  link_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({
    type: 'enum',
    enum: [...BLOCKCHAIN_CHAIN_DB_VALUES],
  })
  chain!: string;

  @Column({ type: 'varchar', length: 255 })
  address!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label!: string | null;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'VERIFIED', 'REVOKED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'VERIFIED' | 'REVOKED';

  @Column({ type: 'datetime', nullable: true })
  linked_at!: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => User, (user) => user.linked_wallets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
