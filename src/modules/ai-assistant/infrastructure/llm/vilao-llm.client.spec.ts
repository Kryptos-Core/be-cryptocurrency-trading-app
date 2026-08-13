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
    expect(client.getDefaultModel()).toBe('ccf/claude-sonnet-5');
    expect(client.getFastModel()).toBe('ccf/claude-haiku-4-5-20251001');
  });

  it('honors custom models', () => {
    const client = new VilaoLlmClient(
      buildConfig({
        VILAO_API_KEY: 'pat-test',
        VILAO_DEFAULT_MODEL: 'ccf/claude-opus-5',
        VILAO_FAST_MODEL: 'ccf/claude-haiku-4-5-20251001',
      }),
    );
    expect(client.getDefaultModel()).toBe('ccf/claude-opus-5');
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
