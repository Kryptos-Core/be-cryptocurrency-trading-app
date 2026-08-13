import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type AiDocSource = 'help_center' | 'faq' | 'docs' | 'manual';

@Index('idx_ai_doc_source', ['source'])
@Index('idx_ai_doc_source_id', ['source', 'source_id'])
@Entity('ai_conversation_doc_chunks')
export class AiConversationDocChunk {
  @PrimaryColumn({ type: 'char', length: 36 })
  chunk_id!: string;

  @Column({
    type: 'enum',
    enum: ['help_center', 'faq', 'docs', 'manual'],
  })
  source!: AiDocSource;

  @Column({ type: 'varchar', length: 255 })
  source_id!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text' })
  chunk_text!: string;

  @Column({ type: 'json' })
  embedding!: number[];

  @Column({ type: 'int', default: 0 })
  token_count!: number;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ precision: 3 })
  created_at!: Date;
}
