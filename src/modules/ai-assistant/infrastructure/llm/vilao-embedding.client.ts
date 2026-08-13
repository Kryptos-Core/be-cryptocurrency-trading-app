import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { VilaoLlmClient } from './vilao-llm.client';

const DEFAULT_EMBEDDING_MODEL = 'openai/gpt-4o-mini';

export interface EmbedResult {
  embedding: number[];
  model: string;
  tokens: number;
}

/**
 * Thin wrapper around the Vilao embeddings endpoint.
 * Falls back to the shared OpenAI client from VilaoLlmClient to avoid
 * creating a second SDK instance.
 */
@Injectable()
export class VilaoEmbeddingClient {
  private readonly logger = new Logger(VilaoEmbeddingClient.name);
  private readonly client: OpenAI | null;
  private readonly defaultModel: string;

  constructor(
    private readonly llmClient: VilaoLlmClient,
    configService: ConfigService,
  ) {
    this.defaultModel =
      configService.get<string>('VILAO_EMBEDDING_MODEL') ?? DEFAULT_EMBEDDING_MODEL;
    // The VilaoLlmClient already constructed the OpenAI client; reuse it via
    // a trivial getter to avoid duplicating the API key wiring.
    this.client = (this.llmClient as unknown as { client: OpenAI | null }).client;
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
