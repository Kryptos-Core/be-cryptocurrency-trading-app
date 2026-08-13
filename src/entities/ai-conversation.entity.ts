import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { AiMessage } from './ai-message.entity';

export type AiConversationIntent =
  | 'guide'
  | 'market'
  | 'trading'
  | 'rag'
  | 'general';

@Index('idx_ai_conv_user', ['user_id'])
@Index('idx_ai_conv_last_msg', ['last_message_at'])
@Entity('ai_conversations')
export class AiConversation {
  @PrimaryColumn({ type: 'char', length: 36 })
  conversation_id!: string;

  @Column({ type: 'char', length: 36 })
  user_id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({
    type: 'enum',
    enum: ['guide', 'market', 'trading', 'rag', 'general'],
    default: 'general',
  })
  intent!: AiConversationIntent;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  last_message_at!: Date | null;

  @Column({ type: 'int', default: 0 })
  message_count!: number;

  @Column({ type: 'int', default: 0 })
  total_tokens_in!: number;

  @Column({ type: 'int', default: 0 })
  total_tokens_out!: number;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deleted_at!: Date | null;

  @CreateDateColumn({ precision: 3 })
  created_at!: Date;

  @UpdateDateColumn({ precision: 3 })
  updated_at!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @OneToMany(() => AiMessage, (m) => m.conversation)
  messages!: AiMessage[];
}
