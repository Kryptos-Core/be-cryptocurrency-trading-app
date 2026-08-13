import { Injectable } from '@nestjs/common';
import { ClassifyIntentUseCase } from './classify-intent.use-case';
import { CONVERSATION_REPOSITORY } from '../../domain/ports';
import { Inject } from '@nestjs/common';
import type { AiConversationRepository } from '../../domain/ports';
import type { AiConversation, AiConversationIntent } from '../../domain/entities/conversation';

export interface CreateConversationInputDto {
  userId: string;
  title?: string;
  intent?: AiConversationIntent;
  firstMessage?: string;
}

@Injectable()
export class CreateConversationUseCase {
  constructor(
    private readonly classifyIntent: ClassifyIntentUseCase,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repo: AiConversationRepository,
  ) {}

  async execute(input: CreateConversationInputDto): Promise<AiConversation> {
    const intent =
      input.intent ??
      (input.firstMessage ? await this.classifyIntent.execute(input.firstMessage) : 'general');
    return this.repo.create({
      userId: input.userId,
      title: input.title ?? autoTitle(input.firstMessage),
      intent,
    });
  }
}

function autoTitle(firstMessage?: string): string {
  if (!firstMessage) return 'Cuộc hội thoại mới';
  const trimmed = firstMessage.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57)}…`;
}
