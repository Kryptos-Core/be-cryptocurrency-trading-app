import {
  Entity,
  PrimaryColumn,
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
  @PrimaryColumn({ type: 'char', length: 36 })
  session_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

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
