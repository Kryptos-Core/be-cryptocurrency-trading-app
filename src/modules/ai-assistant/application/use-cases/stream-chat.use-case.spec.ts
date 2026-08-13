import { StreamChatUseCase, type StreamChatEvent } from './stream-chat.use-case';
import type { VilaoLlmClient, ChatResponse } from '../../infrastructure/llm/vilao-llm.client';
import type { ClassifyIntentUseCase } from './classify-intent.use-case';
import type { BuildContextUseCase } from './build-context.use-case';
import type { AiQuotaService } from '../ai-quota.service';
import { CONVERSATION_REPOSITORY } from '../../domain/ports';
import type { AiConversationRepository } from '../../domain/ports';
import type { AiConversation, AiMessage } from '../../domain/entities/conversation';

const buildFakes = (opts: {
  chatResponse?: ChatResponse;
  chatError?: Error;
  classifyIntent?: 'guide' | 'market' | 'trading' | 'general' | 'rag';
  buildContextOverrides?: Partial<{
    pii: { containsPii: boolean; reasons: string[] };
    intent: 'guide' | 'market' | 'trading' | 'general' | 'rag';
    systemPrompt: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
    tools: unknown[];
    contextRefs: Array<Record<string, unknown>>;
  }>;
  conversation?: AiConversation;
  history?: AiMessage[];
}) => {
  const conversation: AiConversation = opts.conversation ?? {
    conversation_id: 'conv-1',
    user_id: 'user-1',
    title: 'Hello',
    intent: 'general',
    last_message_at: null,
    message_count: 0,
    total_tokens_in: 0,
    total_tokens_out: 0,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const repo: jest.Mocked<AiConversationRepository> = {
    create: jest.fn().mockResolvedValue(conversation),
    listByUser: jest.fn().mockResolvedValue([conversation]),
    countByUser: jest.fn().mockResolvedValue(1),
    findById: jest.fn().mockResolvedValue(conversation),
    updateTitle: jest.fn().mockResolvedValue(conversation),
    updateLastMessage: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(true),
    appendMessage: jest
      .fn()
      .mockImplementation(async (input): Promise<AiMessage> => ({
        message_id: `msg-${input.role}-${input.conversation_id}`,
        conversation_id: input.conversationId,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        tokens_in: input.tokensIn ?? 0,
        tokens_out: input.tokensOut ?? 0,
        tool_calls: input.toolCalls ?? null,
        context_refs: input.contextRefs ?? null,
        parent_message_id: input.parentMessageId ?? null,
        created_at: new Date(),
      })),
    listMessages: jest.fn().mockResolvedValue(opts.history ?? []),
    countMessages: jest.fn().mockResolvedValue(0),
  };

  const llm = {
    isConfigured: true,
    getDefaultModel: () => 'ccf/claude-sonnet-5',
    getFastModel: () => 'ccf/claude-haiku-4-5-20251001',
    chat: opts.chatError
      ? jest.fn().mockRejectedValue(opts.chatError)
      : jest.fn().mockResolvedValue(
          opts.chatResponse ?? {
            content: 'Xin chào',
            model: 'ccf/claude-sonnet-5',
            tokens_in: 10,
            tokens_out: 5,
            finish_reason: 'stop',
            tool_calls: undefined,
          } as ChatResponse,
        ),
    streamChat: jest.fn(),
  } as unknown as VilaoLlmClient;

  const classifyIntent = {
    execute: jest.fn().mockResolvedValue(opts.classifyIntent ?? 'general'),
  } as unknown as ClassifyIntentUseCase;

  const buildContext = {
    execute: jest.fn().mockResolvedValue(
      opts.buildContextOverrides ?? {
        pii: { containsPii: false, reasons: [] },
        intent: 'general',
        systemPrompt: 'system',
        messages: [{ role: 'user' as const, content: 'hi' }],
        tools: [],
        contextRefs: [],
      },
    ),
    getToolHandlers: jest.fn().mockReturnValue({}),
  } as unknown as BuildContextUseCase;

  const quota = {
    checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
    acquireActiveStream: jest.fn().mockResolvedValue(true),
    releaseActiveStream: jest.fn().mockResolvedValue(undefined),
    recordUsage: jest.fn().mockResolvedValue(undefined),
    getRemainingDailyBudget: jest.fn().mockResolvedValue(100000),
    getDailyUsage: jest.fn().mockResolvedValue(0),
    reserveTokens: jest.fn().mockResolvedValue({ allowed: true }),
  } as unknown as AiQuotaService;

  return {
    repo,
    llm,
    classifyIntent,
    buildContext,
    quota,
    conversation,
  };
};

describe('StreamChatUseCase', () => {
  it('emits error when LLM not configured', async () => {
    const f = buildFakes({});
    (f.llm as unknown as { isConfigured: boolean }).isConfigured = false;
    const uc = new StreamChatUseCase(f.llm, f.buildContext, f.classifyIntent, f.quota, f.repo);
    const events: StreamChatEvent[] = [];
    await uc.execute({
      userId: 'user-1',
      userText: 'hi',
      onEvent: (e) => {
        events.push(e);
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'error',
      code: 'LLM_NOT_CONFIGURED',
      message: expect.any(String),
    });
  });

  it('emits rate limit error when blocked', async () => {
    const f = buildFakes({});
    (f.quota.checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      reason: 'spam',
      retryAfterSeconds: 30,
    });
    const uc = new StreamChatUseCase(f.llm, f.buildContext, f.classifyIntent, f.quota, f.repo);
    const events: StreamChatEvent[] = [];
    await uc.execute({
      userId: 'user-1',
      userText: 'hi',
      onEvent: (e) => {
        events.push(e);
      },
    });
    expect(events[0]).toMatchObject({ type: 'error', code: 'RATE_LIMITED' });
  });

  it('emits stream busy error when another stream is in flight', async () => {
    const f = buildFakes({});
    (f.quota.acquireActiveStream as jest.Mock).mockResolvedValue(false);
    const uc = new StreamChatUseCase(f.llm, f.buildContext, f.classifyIntent, f.quota, f.repo);
    const events: StreamChatEvent[] = [];
    await uc.execute({
      userId: 'user-1',
      userText: 'hi',
      onEvent: (e) => {
        events.push(e);
      },
    });
    expect(events[0]).toMatchObject({ type: 'error', code: 'STREAM_BUSY' });
  });

  it('returns assistant refusal when PII detected', async () => {
    const f = buildFakes({
      buildContextOverrides: {
        pii: { containsPii: true, reasons: ['private_key'] },
        intent: 'general',
        systemPrompt: 'system',
        messages: [{ role: 'user' as const, content: 'hi' }],
        tools: [],
        contextRefs: [],
      },
    });
    const uc = new StreamChatUseCase(f.llm, f.buildContext, f.classifyIntent, f.quota, f.repo);
    const events: StreamChatEvent[] = [];
    await uc.execute({
      userId: 'user-1',
      userText: 'hi',
      onEvent: (e) => {
        events.push(e);
      },
    });
    expect(events.find((e) => e.type === 'start')).toBeTruthy();
    expect(events.find((e) => e.type === 'token')).toBeTruthy();
    expect(events.find((e) => e.type === 'done')).toMatchObject({
      type: 'done',
      model: 'pii-refusal',
    });
    expect(f.repo.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        contextRefs: [{ type: 'pii_refusal', reasons: ['private_key'] }],
      }),
    );
  });

  it('happy path: streams tokens, records usage, emits done', async () => {
    const f = buildFakes({
      chatResponse: {
        content: 'BTC đang tăng',
        model: 'ccf/claude-sonnet-5',
        tokens_in: 11,
        tokens_out: 4,
        finish_reason: 'stop',
        tool_calls: undefined,
      },
    });
    const uc = new StreamChatUseCase(f.llm, f.buildContext, f.classifyIntent, f.quota, f.repo);
    const events: StreamChatEvent[] = [];
    await uc.execute({
      userId: 'user-1',
      userText: 'Giá BTC?',
      onEvent: (e) => {
        events.push(e);
      },
    });
    expect(events.some((e) => e.type === 'start')).toBe(true);
    expect(events.some((e) => e.type === 'token')).toBe(true);
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeTruthy();
    expect(f.quota.recordUsage).toHaveBeenCalledWith('user-1', 11, 4);
    expect(f.quota.releaseActiveStream).toHaveBeenCalledWith('user-1');
  });

  it('reuses existing conversation when conversationId provided', async () => {
    const f = buildFakes({});
    const uc = new StreamChatUseCase(f.llm, f.buildContext, f.classifyIntent, f.quota, f.repo);
    await uc.execute({
      userId: 'user-1',
      conversationId: 'conv-1',
      userText: 'hi',
      onEvent: () => undefined,
    });
    expect(f.repo.findById).toHaveBeenCalledWith('conv-1');
    expect(f.repo.create).not.toHaveBeenCalled();
  });

  it('creates new conversation when conversationId missing', async () => {
    const f = buildFakes({});
    const uc = new StreamChatUseCase(f.llm, f.buildContext, f.classifyIntent, f.quota, f.repo);
    await uc.execute({
      userId: 'user-1',
      userText: 'hi',
      onEvent: () => undefined,
    });
    expect(f.repo.create).toHaveBeenCalled();
  });

  it('emits error when LLM throws', async () => {
    const f = buildFakes({ chatError: new Error('timeout') });
    const uc = new StreamChatUseCase(f.llm, f.buildContext, f.classifyIntent, f.quota, f.repo);
    const events: StreamChatEvent[] = [];
    await uc.execute({
      userId: 'user-1',
      userText: 'hi',
      onEvent: (e) => {
        events.push(e);
      },
    });
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      type: 'error',
      code: 'LLM_ERROR',
      message: 'timeout',
    });
    expect(f.quota.releaseActiveStream).toHaveBeenCalledWith('user-1');
  });
});
