import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const DEFAULT_BASE_URL = 'https://api.vilao.ai/v1';

export interface EmbedResult {
  embedding: number[];
  model: string;
  tokens: number;
}

/**
 * Thin wrapper around Vilao's OpenAI-compatible `/v1/embeddings` endpoint.
 *
 * Vilao does not expose an Anthropic-format embeddings API, so we keep the
 * OpenAI SDK for this specific concern. The chat/streaming path lives on
 * `VilaoLlmClient` and uses Claude via the Anthropic-compatible `/v1/messages`
 * endpoint instead.
 */
@Injectable()
export class VilaoEmbeddingClient {
  private readonly logger = new Logger(VilaoEmbeddingClient.name);
  private readonly client: OpenAI | null;
  private readonly defaultModel: string;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('VILAO_API_KEY')?.trim();
    const baseURL = configService.get<string>('VILAO_BASE_URL') ?? DEFAULT_BASE_URL;
    this.defaultModel =
      configService.get<string>('VILAO_EMBEDDING_MODEL') ?? DEFAULT_EMBEDDING_MODEL;

    if (!apiKey) {
      this.logger.warn(
        'VILAO_API_KEY chưa được cấu hình — AI Assistant embeddings sẽ trả lỗi. Xem docs/vilao.ai/VilaoLLM.md.',
      );
      this.client = null;
    } else {
      this.client = new OpenAI({ apiKey, baseURL });
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  async embed(input: string): Promise<EmbedResult> {
    if (!this.client) {
      throw new Error('Vilao embedding client chưa được cấu hình (thiếu VILAO_API_KEY).');
    }
    const response = await this.client.embeddings.create({
      model: this.defaultModel,
      input,
    });
    const data = response.data[0];
    if (!data) {
      throw new Error('Vilao embeddings trả về rỗng');
    }
    return {
      embedding: data.embedding,
      model: response.model,
      tokens: response.usage?.prompt_tokens ?? 0,
    };
  }

  async embedBatch(inputs: string[]): Promise<EmbedResult[]> {
    if (inputs.length === 0) return [];
    if (!this.client) {
      throw new Error('Vilao embedding client chưa được cấu hình (thiếu VILAO_API_KEY).');
    }
    const response = await this.client.embeddings.create({
      model: this.defaultModel,
      input: inputs,
    });
    return response.data.map((d) => ({
      embedding: d.embedding,
      model: response.model,
      tokens: response.usage?.prompt_tokens ?? 0,
    }));
  }
}