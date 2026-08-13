import { VilaoLlmClient } from './vilao-llm.client';
import { ConfigService } from '@nestjs/config';

describe('VilaoLlmClient', () => {
  const buildConfig = (env: Record<string, string | undefined>): ConfigService =>
    ({
      get: (k: string) => env[k],
    }) as unknown as ConfigService;

  it('reports unconfigured when VILAO_API_KEY missing', () => {
    const client = new VilaoLlmClient(buildConfig({ VILAO_API_KEY: undefined }));
    expect(client.isConfigured).toBe(false);
  });

  it('reports configured when key present', () => {
    const client = new VilaoLlmClient(buildConfig({ VILAO_API_KEY: 'pat-test' }));
    expect(client.isConfigured).toBe(true);
  });

  it('uses default model when none configured', () => {
    const client = new VilaoLlmClient(buildConfig({ VILAO_API_KEY: 'pat-test' }));
    expect(client.getDefaultModel()).toBe('gx/gpt-5.4');
    expect(client.getFastModel()).toBe('openai/gpt-4o-mini');
  });

  it('honors custom models', () => {
    const client = new VilaoLlmClient(
      buildConfig({
        VILAO_API_KEY: 'pat-test',
        VILAO_DEFAULT_MODEL: 'openai/gpt-4o',
        VILAO_FAST_MODEL: 'openai/gpt-4o-mini',
      }),
    );
    expect(client.getDefaultModel()).toBe('openai/gpt-4o');
  });

  it('throws when calling chat without API key', async () => {
    const client = new VilaoLlmClient(buildConfig({ VILAO_API_KEY: undefined }));
    await expect(client.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      /Vilao LLM client chưa được cấu hình/,
    );
  });

  it('throws when streaming without API key', async () => {
    const client = new VilaoLlmClient(buildConfig({ VILAO_API_KEY: undefined }));
    const iter: AsyncIterableIterator<unknown> = client.streamChat({ messages: [{ role: 'user', content: 'hi' }] }) as AsyncIterableIterator<unknown>;
    await expect(iter.next()).rejects.toThrow(/Vilao LLM client chưa được cấu hình/);
  });
});
