import { ClassifyIntentUseCase } from './classify-intent.use-case';
import type { VilaoLlmClient, ChatRequest, ChatResponse } from '../../infrastructure/llm/vilao-llm.client';

describe('ClassifyIntentUseCase', () => {
  const buildLlm = (overrides: Partial<VilaoLlmClient> = {}) => {
    const fake = {
      isConfigured: true,
      getDefaultModel: jest.fn().mockReturnValue('ccf/claude-sonnet-5'),
      getFastModel: jest.fn().mockReturnValue('ccf/claude-haiku-4-5-20251001'),
      chat: jest.fn(),
      streamChat: jest.fn(),
      ...overrides,
    } as unknown as VilaoLlmClient;
    return fake;
  };

  it('returns fallback when LLM is not configured', async () => {
    const llm = buildLlm({ isConfigured: false });
    const useCase = new ClassifyIntentUseCase(llm);
    await expect(useCase.execute('giá BTC hôm nay')).resolves.toBe('general');
  });

  it('returns fallback for empty input', async () => {
    const llm = buildLlm();
    const useCase = new ClassifyIntentUseCase(llm);
    await expect(useCase.execute('   ')).resolves.toBe('general');
  });

  it('parses returned intent label', async () => {
    const llm = buildLlm({
      chat: jest.fn().mockResolvedValue({
        content: 'market',
        model: 'ccf/claude-haiku-4-5-20251001',
        tokens_in: 5,
        tokens_out: 1,
        finish_reason: 'stop',
      } as ChatResponse),
    });
    const useCase = new ClassifyIntentUseCase(llm);
    await expect(useCase.execute('Giá BTC/USDT hôm nay bao nhiêu?')).resolves.toBe('market');
    expect(llm.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'ccf/claude-haiku-4-5-20251001',
        temperature: 0,
        max_tokens: 8,
      }),
    );
  });

  it('returns fallback when LLM call throws', async () => {
    const llm = buildLlm({ chat: jest.fn().mockRejectedValue(new Error('LLM down')) });
    const useCase = new ClassifyIntentUseCase(llm);
    await expect(useCase.execute('something')).resolves.toBe('general');
  });

  it('returns fallback when LLM returns unknown label', async () => {
    const llm = buildLlm({
      chat: jest.fn().mockResolvedValue({
        content: 'unknown-label',
        model: 'ccf/claude-haiku-4-5-20251001',
        tokens_in: 1,
        tokens_out: 1,
        finish_reason: 'stop',
      } as ChatResponse),
    });
    const useCase = new ClassifyIntentUseCase(llm);
    await expect(useCase.execute('xxx')).resolves.toBe('general');
  });
});
