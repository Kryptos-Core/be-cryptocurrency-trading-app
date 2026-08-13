import { Injectable, Logger } from '@nestjs/common';
import { VilaoLlmClient } from '../../infrastructure/llm/vilao-llm.client';
import { RagRetrievalService } from '../rag-retrieval.service';
import { ClassifyIntentUseCase } from './classify-intent.use-case';
import { MarketContextTool } from '../../infrastructure/tools/market-context.tool';
import { UserContextTool } from '../../infrastructure/tools/user-context.tool';
import { CONVERSATION_REPOSITORY } from '../../domain/ports';
import { Inject } from '@nestjs/common';
import type { AiConversationRepository } from '../../domain/ports';
import { SYSTEM_PROMPT_VI, RAG_SYSTEM_PROMPT_VI } from '../../prompts/system-prompt.vi';
import { detectPii, PII_REFUSAL_MESSAGE_VI } from '../../prompts/pii-filter';
import { AI_TOOLS } from '../../strategies/tools.registry';
import { PiiDetectionResult } from '../../prompts/pii-filter';
import type { AiConversationIntent } from '../../domain/entities/conversation';

export interface BuildContextAndMessagesInput {
  userId: string;
  conversationId: string;
  userText: string;
  /** When the conversation already has an intent, reuse it instead of re-classifying. */
  existingIntent?: AiConversationIntent;
}

export interface BuildContextAndMessagesResult {
  pii: PiiDetectionResult;
  intent: AiConversationIntent;
  systemPrompt: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  tools: typeof AI_TOOLS;
  contextRefs: Array<Record<string, unknown>>;
}

const HISTORY_LIMIT = 20;
const RAG_TOP_K = 4;
const RAG_CONTEXT_CHARS = 2400;

@Injectable()
export class BuildContextUseCase {
  private readonly logger = new Logger(BuildContextUseCase.name);

  constructor(
    private readonly llm: VilaoLlmClient,
    private readonly classifyIntent: ClassifyIntentUseCase,
    private readonly rag: RagRetrievalService,
    private readonly marketTool: MarketContextTool,
    private readonly userTool: UserContextTool,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repo: AiConversationRepository,
  ) {}

  async execute(input: BuildContextAndMessagesInput): Promise<BuildContextAndMessagesResult> {
    const pii = detectPii(input.userText);
    const intent = input.existingIntent ?? (await this.classifyIntent.execute(input.userText));

    const history = await this.repo.listMessages({
      conversationId: input.conversationId,
      page: 1,
      limit: HISTORY_LIMIT,
    });

    const conversationMessages = history.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant' | 'tool',
      content: m.content,
    }));

    const contextRefs: Array<Record<string, unknown>> = [];
    let systemPrompt = SYSTEM_PROMPT_VI;

    if (intent === 'guide' || intent === 'rag') {
      const docs = await this.rag.retrieve(input.userText, RAG_TOP_K);
      if (docs.length > 0) {
        const truncated = docs
          .map((d) => {
            const text = d.chunk_text.length > 600 ? `${d.chunk_text.slice(0, 600)}…` : d.chunk_text;
            return `[${d.source}] ${d.title}\n${text}`;
          })
          .join('\n\n---\n\n');
        const capped = truncated.length > RAG_CONTEXT_CHARS
          ? `${truncated.slice(0, RAG_CONTEXT_CHARS)}…`
          : truncated;
        systemPrompt = RAG_SYSTEM_PROMPT_VI.replace('{docs}', capped);
        contextRefs.push(
          ...docs.map((d) => ({
            type: 'doc',
            chunk_id: d.chunk_id,
            source: d.source,
            source_id: d.source_id,
            score: Number(d.score.toFixed(3)),
          })),
        );
      }
    }

    if (intent === 'trading') {
      contextRefs.push({ type: 'tool_scope', tools: ['get_my_wallets', 'get_my_open_orders', 'get_my_recent_orders'] });
    } else if (intent === 'market') {
      contextRefs.push({ type: 'tool_scope', tools: ['get_ticker', 'get_ohlcv'] });
    }

    return {
      pii,
      intent,
      systemPrompt,
      messages: [...conversationMessages, { role: 'user', content: input.userText }],
      tools: AI_TOOLS,
      contextRefs,
    };
  }

  getToolHandlers(): Record<string, (args: Record<string, unknown>, userId: string) => Promise<unknown>> {
    const map: Record<string, (args: Record<string, unknown>, userId: string) => Promise<unknown>> = {};
    for (const def of this.marketTool.definitions()) {
      map[def.name] = (args, userId) => def.handler(args, { userId, conversationId: '' });
    }
    for (const def of this.userTool.definitions()) {
      map[def.name] = (args, userId) => def.handler(args, { userId, conversationId: '' });
    }
    return map;
  }

  static refusalMessage(pii: PiiDetectionResult): string {
    if (!pii.containsPii) return '';
    return PII_REFUSAL_MESSAGE_VI;
  }
}
