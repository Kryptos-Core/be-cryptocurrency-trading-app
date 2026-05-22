import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum BinancePermission {
  SPOT = 'SPOT',
  FUTURES = 'FUTURES',
}

@Entity('user_binance_credentials')
@Index('idx_ubc_user', ['user_id'])
@Index('uk_ubc_user_label', ['user_id', 'label'], { unique: true })
export class UserBinanceCredentials {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({ type: 'text' })
  credentials_encrypted!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label!: string | null;

  @Column({ type: 'simple-array', default: 'SPOT' })
  permissions!: string[];

  @Column({ type: 'boolean', default: false })
  testnet!: boolean;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  last_used_at!: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(
    () => User,
    (user) => user.binance_credentials,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
