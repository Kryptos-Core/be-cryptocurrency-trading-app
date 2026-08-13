import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { AiConversation } from './ai-conversation.entity';

export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool';

@Index('idx_ai_msg_conv', ['conversation_id'])
@Index('idx_ai_msg_created', ['created_at'])
@Entity('ai_messages')
export class AiMessage {
  @PrimaryColumn({ type: 'char', length: 36 })
  message_id!: string;

  @Column({ type: 'char', length: 36 })
  conversation_id!: string;

  @Column({
    type: 'enum',
    enum: ['system', 'user', 'assistant', 'tool'],
  })
  role!: AiMessageRole;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model!: string | null;

  @Column({ type: 'int', default: 0 })
  tokens_in!: number;

  @Column({ type: 'int', default: 0 })
  tokens_out!: number;

  @Column({ type: 'json', nullable: true })
  tool_calls!: Array<Record<string, unknown>> | null;

  @Column({ type: 'json', nullable: true })
  context_refs!: Array<Record<string, unknown>> | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  parent_message_id!: string | null;

  @CreateDateColumn({ precision: 3 })
  created_at!: Date;

  @ManyToOne(() => AiConversation, (c) => c.messages, { onDelete: 'CASCADE' })
  conversation!: AiConversation;
}
