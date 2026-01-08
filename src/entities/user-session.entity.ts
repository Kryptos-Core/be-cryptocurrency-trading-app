import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  ForeignKey,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_sessions')
@Index('idx_sessions_user', ['user_id'])
@Index('idx_sessions_exp', ['expires_at'])
export class UserSession {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  session_id!: number;

  @Column({ type: 'bigint' })
  @ForeignKey(() => User)
  user_id!: number;

  @Column({ type: 'varbinary' })
  refresh_token_hash!: Buffer;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_agent!: string;

  @Column({ type: 'datetime' })
  expires_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => User, (user) => user.sessions, {
    onDelete: 'CASCADE',
  })
  user!: User;
}
