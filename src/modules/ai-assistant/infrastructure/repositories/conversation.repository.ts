import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AiConversation } from '@/entities/ai-conversation.entity';
import { AiMessage } from '@/entities/ai-message.entity';
import type {
  AiConversationRepository,
  AppendMessageInput,
  CreateConversationInput,
  ListConversationsOptions,
  ListMessagesOptions,
} from '../../domain/ports';
import type {
  AiConversation as DomainConversation,
  AiMessage as DomainMessage,
} from '../../domain/entities/conversation';

function toDomainConversation(entity: AiConversation): DomainConversation {
  return {
    conversation_id: entity.conversation_id,
    user_id: entity.user_id,
    title: entity.title,
    intent: entity.intent,
    last_message_at: entity.last_message_at,
    message_count: entity.message_count,
    total_tokens_in: entity.total_tokens_in,
    total_tokens_out: entity.total_tokens_out,
    deleted_at: entity.deleted_at,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
  };
}

function toDomainMessage(entity: AiMessage): DomainMessage {
  return {
    message_id: entity.message_id,
    conversation_id: entity.conversation_id,
    role: entity.role,
    content: entity.content,
    model: entity.model,
    tokens_in: entity.tokens_in,
    tokens_out: entity.tokens_out,
    tool_calls: entity.tool_calls,
    context_refs: entity.context_refs,
    parent_message_id: entity.parent_message_id,
    created_at: entity.created_at,
  };
}

@Injectable()
export class TypeOrmAiConversationRepository implements AiConversationRepository {
  constructor(
    @InjectRepository(AiConversation)
    private readonly convRepo: Repository<AiConversation>,
    @InjectRepository(AiMessage)
    private readonly msgRepo: Repository<AiMessage>,
  ) {}

  async create(input: CreateConversationInput): Promise<DomainConversation> {
    const entity = this.convRepo.create({
      conversation_id: uuidv7(),
      user_id: input.userId,
      title: input.title ?? 'Cuộc hội thoại mới',
      intent: input.intent ?? 'general',
    });
    const saved = await this.convRepo.save(entity);
    return toDomainConversation(saved);
  }

  async listByUser(opts: ListConversationsOptions): Promise<DomainConversation[]> {
    const qb = this.convRepo
      .createQueryBuilder('c')
      .where('c.user_id = :userId', { userId: opts.userId })
      .orderBy('c.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('c.created_at', 'DESC')
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit);
    if (!opts.includeDeleted) {
      qb.andWhere('c.deleted_at IS NULL');
    }
    const rows = await qb.getMany();
    return rows.map(toDomainConversation);
  }

  async countByUser(opts: ListConversationsOptions): Promise<number> {
    const qb = this.convRepo
      .createQueryBuilder('c')
      .where('c.user_id = :userId', { userId: opts.userId });
    if (!opts.includeDeleted) {
      qb.andWhere('c.deleted_at IS NULL');
    }
    return qb.getCount();
  }

  async findById(conversationId: string): Promise<DomainConversation | null> {
    const row = await this.convRepo.findOne({ where: { conversation_id: conversationId } });
    return row ? toDomainConversation(row) : null;
  }

  async updateTitle(conversationId: string, title: string): Promise<DomainConversation | null> {
    await this.convRepo.update({ conversation_id: conversationId }, { title });
    return this.findById(conversationId);
  }

  async updateLastMessage(conversationId: string, tokensIn: number, tokensOut: number): Promise<void> {
    await this.convRepo
      .createQueryBuilder()
      .update()
      .set({
        last_message_at: () => 'CURRENT_TIMESTAMP(3)',
        message_count: () => 'message_count + 1',
        total_tokens_in: () => `total_tokens_in + ${Math.max(0, tokensIn | 0)}`,
        total_tokens_out: () => `total_tokens_out + ${Math.max(0, tokensOut | 0)}`,
      })
      .where('conversation_id = :id', { id: conversationId })
      .execute();
  }

  async softDelete(conversationId: string, userId: string): Promise<boolean> {
    const result = await this.convRepo
      .createQueryBuilder()
      .update()
      .set({ deleted_at: () => 'CURRENT_TIMESTAMP(3)' })
      .where('conversation_id = :id AND user_id = :userId AND deleted_at IS NULL', {
        id: conversationId,
        userId,
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async appendMessage(input: AppendMessageInput): Promise<DomainMessage> {
    const entity = this.msgRepo.create({
      message_id: uuidv7(),
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      model: input.model ?? null,
      tokens_in: input.tokensIn ?? 0,
      tokens_out: input.tokensOut ?? 0,
      tool_calls: input.toolCalls ?? null,
      context_refs: input.contextRefs ?? null,
      parent_message_id: input.parentMessageId ?? null,
    });
    const saved = await this.msgRepo.save(entity);
    return toDomainMessage(saved);
  }

  async listMessages(opts: ListMessagesOptions): Promise<DomainMessage[]> {
    const rows = await this.msgRepo.find({
      where: { conversation_id: opts.conversationId },
      order: { created_at: 'ASC' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    });
    return rows.map(toDomainMessage);
  }

  async countMessages(opts: ListMessagesOptions): Promise<number> {
    return this.msgRepo.count({
      where: { conversation_id: opts.conversationId },
    });
  }
}
