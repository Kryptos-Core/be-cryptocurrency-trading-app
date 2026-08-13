import { GetConversationsQuery } from './get-conversations.query';
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
  listByUser: jest.fn().mockResolvedValue([conv]),
  countByUser: jest.fn().mockResolvedValue(1),
  findById: jest.fn().mockResolvedValue(conv),
  updateTitle: jest.fn().mockResolvedValue(conv),
  updateLastMessage: jest.fn().mockResolvedValue(undefined),
  softDelete: jest.fn().mockResolvedValue(true),
  appendMessage: jest.fn().mockResolvedValue({} as AiMessage),
  listMessages: jest.fn().mockResolvedValue([]),
  countMessages: jest.fn().mockResolvedValue(0),
  ...overrides,
});

describe('GetConversationsQuery', () => {
  it('returns paginated conversations', async () => {
    const repo = buildRepo();
    const q = new GetConversationsQuery(repo);
    const result = await q.execute({ userId: 'user-1', page: 1, limit: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('returns conversation with messages', async () => {
    const repo = buildRepo();
    const q = new GetConversationsQuery(repo);
    const result = await q.getConversationWithMessages({
      conversationId: 'conv-1',
      userId: 'user-1',
      page: 1,
      limit: 100,
    });
    expect(result.conversation).toEqual(conv);
    expect(result.items).toEqual([]);
  });

  it('throws when conversation belongs to another user', async () => {
    const repo = buildRepo({
      findById: jest.fn().mockResolvedValue({ ...conv, user_id: 'someone-else' }),
    });
    const q = new GetConversationsQuery(repo);
    await expect(
      q.getConversationWithMessages({
        conversationId: 'conv-1',
        userId: 'user-1',
        page: 1,
        limit: 100,
      }),
    ).rejects.toThrow('Conversation not found');
  });

  it('throws when conversation is deleted', async () => {
    const repo = buildRepo({
      findById: jest.fn().mockResolvedValue({ ...conv, deleted_at: new Date() }),
    });
    const q = new GetConversationsQuery(repo);
    await expect(
      q.getConversationWithMessages({
        conversationId: 'conv-1',
        userId: 'user-1',
        page: 1,
        limit: 100,
      }),
    ).rejects.toThrow('Conversation not found');
  });

  it('soft deletes conversation', async () => {
    const repo = buildRepo();
    const q = new GetConversationsQuery(repo);
    await expect(q.softDelete('conv-1', 'user-1')).resolves.toBe(true);
    expect(repo.softDelete).toHaveBeenCalledWith('conv-1', 'user-1');
  });
});
