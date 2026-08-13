import { Injectable } from '@nestjs/common';
import { VilaoLlmClient } from '../../infrastructure/llm/vilao-llm.client';
import { INTENT_CLASSIFIER_PROMPT } from '../../prompts/system-prompt.vi';
import type { AiConversationIntent } from '../../domain/entities/conversation';

const VALID: AiConversationIntent[] = ['guide', 'market', 'trading', 'general', 'rag'];
const FALLBACK: AiConversationIntent = 'general';

@Injectable()
export class ClassifyIntentUseCase {
  constructor(private readonly llm: VilaoLlmClient) {}

  async execute(input: string): Promise<AiConversationIntent> {
    if (!this.llm.isConfigured) return FALLBACK;
    const trimmed = input.trim();
    if (trimmed.length === 0) return FALLBACK;
    try {
      const res = await this.llm.chat({
        model: this.llm.getFastModel(),
        messages: [
          { role: 'system', content: 'Bạn là bộ phân loại ý định. Chỉ trả 1 từ.' },
          { role: 'user', content: INTENT_CLASSIFIER_PROMPT.replace('{input}', trimmed) },
        ],
        temperature: 0,
        max_tokens: 8,
      });
      const raw = res.content.trim().toLowerCase().split(/\s+/)[0] ?? '';
      const hit = VALID.find((v) => raw.startsWith(v));
      return hit ?? FALLBACK;
    } catch {
      return FALLBACK;
    }
  }
}
