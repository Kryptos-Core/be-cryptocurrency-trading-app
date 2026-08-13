import { BuildContextUseCase } from './build-context.use-case';
import { CONVERSATION_REPOSITORY, type AiConversationRepository } from '../../domain/ports';
import { ClassifyIntentUseCase } from './classify-intent.use-case';
import { RagRetrievalService } from '../rag-retrieval.service';
import { MarketContextTool } from '../../infrastructure/tools/market-context.tool';
import { UserContextTool } from '../../infrastructure/tools/user-context.tool';
import type { VilaoLlmClient } from '../../infrastructure/llm/vilao-llm.client';
import type { AiConversation, AiMessage } from '../../domain/entities/conversation';

const conv: AiConversation = {
  conversation_id: 'conv-1',
  user_id: 'user-1',
  title: 't',
  intent: 'general',
  last_message_at: null,
  message_count: 0,
  total_tokens_in: 0,
  total_tokens_out: 0,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const buildRepo = (history: AiMessage[] = []): AiConversationRepository => ({
  create: jest.fn().mockResolvedValue(conv),
  listByUser: jest.fn().mockResolvedValue([]),
  countByUser: jest.fn().mockResolvedValue(0),
  findById: jest.fn().mockResolvedValue(conv),
  updateTitle: jest.fn().mockResolvedValue(conv),
  updateLastMessage: jest.fn().mockResolvedValue(undefined),
  softDelete: jest.fn().mockResolvedValue(true),
  appendMessage: jest.fn().mockResolvedValue({} as AiMessage),
  listMessages: jest.fn().mockResolvedValue(history),
  countMessages: jest.fn().mockResolvedValue(0),
});

const buildMocks = (opts: {
  intent?: 'guide' | 'market' | 'trading' | 'general' | 'rag';
  ragResults?: Array<{ chunk_id: string; source: string; source_id: string; title: string; chunk_text: string; score: number; metadata: Record<string, unknown> | null }>;
  history?: AiMessage[];
}) => {
  const llm = { isConfigured: true } as unknown as VilaoLlmClient;
  const classifyIntent = {
    execute: jest.fn().mockResolvedValue(opts.intent ?? 'general'),
  } as unknown as ClassifyIntentUseCase;
  const rag = {
    retrieve: jest.fn().mockResolvedValue(opts.ragResults ?? []),
    invalidateCache: jest.fn(),
  } as unknown as RagRetrievalService;
  const marketTool = { definitions: jest.fn().mockReturnValue([]) } as unknown as MarketContextTool;
  const userTool = { definitions: jest.fn().mockReturnValue([]) } as unknown as UserContextTool;
  const repo = buildRepo(opts.history ?? []);
  return { llm, classifyIntent, rag, marketTool, userTool, repo };
};

describe('BuildContextUseCase', () => {
  it('builds system prompt + messages for general intent', async () => {
    const m = buildMocks({ intent: 'general' });
    const uc = new BuildContextUseCase(m.llm, m.classifyIntent, m.rag, m.marketTool, m.userTool, m.repo);
    const r = await uc.execute({
      userId: 'user-1',
      conversationId: 'conv-1',
      userText: 'xin chào',
    });
    expect(r.intent).toBe('general');
    expect(r.messages.some((msg) => msg.content === 'xin chào')).toBe(true);
    expect(r.contextRefs).toHaveLength(0);
  });

  it('injects RAG chunks for guide intent', async () => {
    const m = buildMocks({
      intent: 'guide',
      ragResults: [
        {
          chunk_id: 'c1',
          source: 'docs',
          source_id: 's1',
          title: 'help',
          chunk_text: 'guide content',
          score: 0.9,
          metadata: null,
        },
      ],
    });
    const uc = new BuildContextUseCase(m.llm, m.classifyIntent, m.rag, m.marketTool, m.userTool, m.repo);
    const r = await uc.execute({
      userId: 'user-1',
      conversationId: 'conv-1',
      userText: 'cách đặt lệnh?',
    });
    expect(r.systemPrompt).toContain('<doc_chunks>');
    expect(r.contextRefs.some((ref) => ref.type === 'doc')).toBe(true);
  });

  it('annotates tool scope for trading intent', async () => {
    const m = buildMocks({ intent: 'trading' });
    const uc = new BuildContextUseCase(m.llm, m.classifyIntent, m.rag, m.marketTool, m.userTool, m.repo);
    const r = await uc.execute({
      userId: 'user-1',
      conversationId: 'conv-1',
      userText: 'lệnh BTC hiện tại?',
    });
    expect(r.contextRefs.some((ref) => ref.type === 'tool_scope')).toBe(true);
  });

  it('reuses existing intent when provided', async () => {
    const m = buildMocks({ intent: 'general' });
    const uc = new BuildContextUseCase(m.llm, m.classifyIntent, m.rag, m.marketTool, m.userTool, m.repo);
    await uc.execute({
      userId: 'user-1',
      conversationId: 'conv-1',
      userText: 'something',
      existingIntent: 'market',
    });
    expect(m.classifyIntent.execute).not.toHaveBeenCalled();
  });

  it('detects PII in user text', async () => {
    const m = buildMocks({ intent: 'general' });
    const uc = new BuildContextUseCase(m.llm, m.classifyIntent, m.rag, m.marketTool, m.userTool, m.repo);
    const r = await uc.execute({
      userId: 'user-1',
      conversationId: 'conv-1',
      userText: 'password: hunter2',
    });
    expect(r.pii.containsPii).toBe(true);
  });

  it('returned refusal message is non-empty when PII detected', () => {
    const refusal = BuildContextUseCase.refusalMessage({ containsPii: true, reasons: ['jwt'] });
    expect(refusal.length).toBeGreaterThan(20);
  });

  it('returns empty refusal when no PII', () => {
    const refusal = BuildContextUseCase.refusalMessage({ containsPii: false, reasons: [] });
    expect(refusal).toBe('');
  });
});
