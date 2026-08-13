import { CreateConversationUseCase } from './create-conversation.use-case';
import { CONVERSATION_REPOSITORY, type AiConversationRepository } from '../../domain/ports';
import { ClassifyIntentUseCase } from './classify-intent.use-case';
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

const buildRepo = (): AiConversationRepository => ({
  create: jest.fn().mockResolvedValue(conv),
  listByUser: jest.fn().mockResolvedValue([]),
  countByUser: jest.fn().mockResolvedValue(0),
  findById: jest.fn().mockResolvedValue(conv),
  updateTitle: jest.fn().mockResolvedValue(conv),
  updateLastMessage: jest.fn().mockResolvedValue(undefined),
  softDelete: jest.fn().mockResolvedValue(true),
  appendMessage: jest.fn().mockResolvedValue({} as AiMessage),
  listMessages: jest.fn().mockResolvedValue([]),
  countMessages: jest.fn().mockResolvedValue(0),
});

describe('CreateConversationUseCase', () => {
  it('creates conversation with explicit intent', async () => {
    const repo = buildRepo();
    const classifyIntent = new ClassifyIntentUseCase({ isConfigured: false } as unknown as VilaoLlmClient);
    const uc = new CreateConversationUseCase(classifyIntent, repo);
    const result = await uc.execute({
      userId: 'user-1',
      intent: 'market',
      title: 'BTC analysis',
    });
    expect(result).toEqual(conv);
    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      intent: 'market',
      title: 'BTC analysis',
    });
  });

  it('auto classifies intent from first message when LLM configured', async () => {
    const repo = buildRepo();
    const classifyIntent = {
      execute: jest.fn().mockResolvedValue('market'),
    } as unknown as ClassifyIntentUseCase;
    const uc = new CreateConversationUseCase(classifyIntent, repo);
    const result = await uc.execute({
      userId: 'user-1',
      firstMessage: 'Giá BTC hôm nay?',
    });
    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      intent: 'market',
      title: 'Giá BTC hôm nay?',
    });
  });

  it('auto-truncates long titles', async () => {
    const repo = buildRepo();
    const classifyIntent = {
      execute: jest.fn().mockResolvedValue('general'),
    } as unknown as ClassifyIntentUseCase;
    const uc = new CreateConversationUseCase(classifyIntent, repo);
    const long = 'a'.repeat(200);
    await uc.execute({ userId: 'user-1', firstMessage: long });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/^a{57}…$/) }),
    );
  });
});
