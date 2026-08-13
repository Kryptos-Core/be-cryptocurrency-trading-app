import { Injectable } from '@nestjs/common';
import { CONVERSATION_REPOSITORY } from '../../domain/ports';
import { Inject } from '@nestjs/common';
import type { AiConversationRepository } from '../../domain/ports';
import type { AiConversation, AiMessage } from '../../domain/entities/conversation';

export interface GetConversationsQueryInput {
  userId: string;
  page: number;
  limit: number;
}

export interface GetConversationsQueryResult {
  items: AiConversation[];
  page: number;
  limit: number;
  total: number;
}

export interface GetMessagesQueryInput {
  conversationId: string;
  userId: string;
  page: number;
  limit: number;
}

export interface GetMessagesQueryResult {
  items: AiMessage[];
  page: number;
  limit: number;
  total: number;
  conversation: AiConversation;
}

@Injectable()
export class GetConversationsQuery {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repo: AiConversationRepository,
  ) {}

  async execute(input: GetConversationsQueryInput): Promise<GetConversationsQueryResult> {
    const [items, total] = await Promise.all([
      this.repo.listByUser({
        userId: input.userId,
        page: input.page,
        limit: input.limit,
      }),
      this.repo.countByUser({
        userId: input.userId,
        page: input.page,
        limit: input.limit,
      }),
    ]);
    return { items, page: input.page, limit: input.limit, total };
  }

  async getConversationWithMessages(input: GetMessagesQueryInput): Promise<GetMessagesQueryResult> {
    const conv = await this.repo.findById(input.conversationId);
    if (!conv || conv.user_id !== input.userId || conv.deleted_at) {
      throw new Error('Conversation not found');
    }
    const [items, total] = await Promise.all([
      this.repo.listMessages({
        conversationId: input.conversationId,
        page: input.page,
        limit: input.limit,
      }),
      this.repo.countMessages({
        conversationId: input.conversationId,
        page: input.page,
        limit: input.limit,
      }),
    ]);
    return { items, page: input.page, limit: input.limit, total, conversation: conv };
  }

  async softDelete(conversationId: string, userId: string): Promise<boolean> {
    return this.repo.softDelete(conversationId, userId);
  }
}
