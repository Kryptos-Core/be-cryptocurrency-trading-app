import { Injectable } from '@nestjs/common';
import { CONVERSATION_REPOSITORY } from '../../domain/ports';
import { Inject } from '@nestjs/common';
import type { AiConversationRepository } from '../../domain/ports';
import type { AiMessage } from '../../domain/entities/conversation';

export interface AppendMessageInputDto {
  conversationId: string;
  userId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  toolCalls?: Array<Record<string, unknown>> | null;
  contextRefs?: Array<Record<string, unknown>> | null;
  parentMessageId?: string | null;
}

@Injectable()
export class AppendMessageUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repo: AiConversationRepository,
  ) {}

  async execute(input: AppendMessageInputDto): Promise<AiMessage> {
    const conv = await this.repo.findById(input.conversationId);
    if (!conv) {
      throw new Error(`Conversation ${input.conversationId} not found`);
    }
    if (conv.user_id !== input.userId) {
      throw new Error('Conversation does not belong to user');
    }
    const msg = await this.repo.appendMessage({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      model: input.model ?? null,
      tokensIn: input.tokensIn ?? 0,
      tokensOut: input.tokensOut ?? 0,
      toolCalls: input.toolCalls ?? null,
      contextRefs: input.contextRefs ?? null,
      parentMessageId: input.parentMessageId ?? null,
    });
    await this.repo.updateLastMessage(input.conversationId, input.tokensIn ?? 0, input.tokensOut ?? 0);
    return msg;
  }
}
