import { AppendMessageUseCase } from './append-message.use-case';
import { CONVERSATION_REPOSITORY, type AiConversationRepository } from '../../domain/ports';
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

const buildRepo = (overrides: Partial<AiConversationRepository> = {}): AiConversationRepository => ({
  create: jest.fn().mockResolvedValue(conv),
  listByUser: jest.fn().mockResolvedValue([]),
  countByUser: jest.fn().mockResolvedValue(0),
  findById: jest.fn().mockResolvedValue(conv),
  updateTitle: jest.fn().mockResolvedValue(conv),
  updateLastMessage: jest.fn().mockResolvedValue(undefined),
  softDelete: jest.fn().mockResolvedValue(true),
  appendMessage: jest.fn().mockImplementation(async (input): Promise<AiMessage> => ({
    message_id: 'msg-1',
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
  listMessages: jest.fn().mockResolvedValue([]),
  countMessages: jest.fn().mockResolvedValue(0),
  ...overrides,
});

describe('AppendMessageUseCase', () => {
  it('appends message when conversation exists and belongs to user', async () => {
    const repo = buildRepo();
    const uc = new AppendMessageUseCase(repo);
    const msg = await uc.execute({
      conversationId: 'conv-1',
      userId: 'user-1',
      role: 'user',
      content: 'hello',
      tokensIn: 5,
      tokensOut: 0,
    });
    expect(msg.message_id).toBe('msg-1');
    expect(repo.appendMessage).toHaveBeenCalled();
    expect(repo.updateLastMessage).toHaveBeenCalledWith('conv-1', 5, 0);
  });

  it('throws when conversation not found', async () => {
    const repo = buildRepo({ findById: jest.fn().mockResolvedValue(null) });
    const uc = new AppendMessageUseCase(repo);
    await expect(
      uc.execute({ conversationId: 'missing', userId: 'user-1', role: 'user', content: 'x' }),
    ).rejects.toThrow('not found');
  });

  it('throws when conversation belongs to another user', async () => {
    const repo = buildRepo({
      findById: jest.fn().mockResolvedValue({ ...conv, user_id: 'someone-else' }),
    });
    const uc = new AppendMessageUseCase(repo);
    await expect(
      uc.execute({ conversationId: 'conv-1', userId: 'user-1', role: 'user', content: 'x' }),
    ).rejects.toThrow('does not belong');
  });
});
