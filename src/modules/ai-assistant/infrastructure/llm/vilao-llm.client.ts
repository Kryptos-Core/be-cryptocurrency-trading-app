import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<Record<string, unknown>>;
}

export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  finish_reason: string;
  tool_calls?: Array<Record<string, unknown>>;
}

export interface ChatStreamChunk {
  delta: string;
  tool_calls?: Array<Record<string, unknown>>;
  finish_reason?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const DEFAULT_BASE_URL = 'https://api.vilao.ai/v1';
const DEFAULT_MODEL = 'gx/gpt-5.4';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
const SOFT_ERROR_LOG_PREFIX = '[vilao-llm] soft error';

/**
 * Vilao LLM client.
 *
 * Wraps the OpenAI SDK pointed at Vilao's OpenAI-compatible endpoint.
 * Returns graceful degradation when the API key is missing so the rest of the
 * app can still boot (dev) or fail fast (production) per `failFastInProd`.
 */
@Injectable()
export class VilaoLlmClient {
  private readonly logger = new Logger(VilaoLlmClient.name);
  private readonly client: OpenAI | null;
  private readonly defaultModel: string;
  private readonly fastModel: string;
  private readonly failFastInProd: boolean;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('VILAO_API_KEY')?.trim();
    const baseURL = configService.get<string>('VILAO_BASE_URL') ?? DEFAULT_BASE_URL;
    this.defaultModel =
      configService.get<string>('VILAO_DEFAULT_MODEL') ?? DEFAULT_MODEL;
    this.fastModel = configService.get<string>('VILAO_FAST_MODEL') ?? 'openai/gpt-4o-mini';
    this.failFastInProd = (configService.get<string>('NODE_ENV') ?? 'development') === 'production';

    if (!apiKey) {
      this.logger.warn(
        'VILAO_API_KEY chưa được cấu hình — AI Assistant sẽ trả lỗi cho mọi request. Xem docs/vilao.ai/VilaoLLM.md.',
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

  getFastModel(): string {
    return this.fastModel;
  }

  /**
   * Non-streaming chat completion. Returns parsed response with token counts.
   */
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const client = this.requireClient();
    const model = req.model ?? this.defaultModel;
    const response = await this.withRetry(() =>
      client.chat.completions.create({
        model,
        messages: req.messages as OpenAI.ChatCompletionMessageParam[],
        tools: req.tools as OpenAI.ChatCompletionTool[] | undefined,
        tool_choice: req.tool_choice as OpenAI.ChatCompletionToolChoiceOption | undefined,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.max_tokens,
        stream: false,
      }),
      req.signal,
    );

    const choice = response.choices[0];
    return {
      content: choice?.message?.content ?? '',
      model: response.model,
      tokens_in: response.usage?.prompt_tokens ?? 0,
      tokens_out: response.usage?.completion_tokens ?? 0,
      finish_reason: choice?.finish_reason ?? 'unknown',
      tool_calls: (choice?.message?.tool_calls as Array<Record<string, unknown>> | undefined) ?? undefined,
    };
  }

  /**
   * Streaming chat completion. Returns an async iterable of chunks.
   * The final chunk carries `usage` (when the upstream reports it).
   */
  async *streamChat(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const client = this.requireClient();
    const model = req.model ?? this.defaultModel;
    const stream = await this.withRetry(
      () =>
        client.chat.completions.create({
          model,
          messages: req.messages as OpenAI.ChatCompletionMessageParam[],
          tools: req.tools as OpenAI.ChatCompletionTool[] | undefined,
          tool_choice: req.tool_choice as OpenAI.ChatCompletionToolChoiceOption | undefined,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.max_tokens,
          stream: true,
          stream_options: { include_usage: true },
        }),
      req.signal,
    );

    for await (const raw of stream as AsyncIterable<OpenAI.ChatCompletionChunk>) {
      const choice = raw.choices[0];
      const chunk: ChatStreamChunk = {
        delta: choice?.delta?.content ?? '',
        tool_calls: (choice?.delta?.tool_calls as Array<Record<string, unknown>> | undefined) ?? undefined,
        finish_reason: choice?.finish_reason ?? undefined,
      };
      if (raw.usage) {
        chunk.usage = {
          prompt_tokens: raw.usage.prompt_tokens,
          completion_tokens: raw.usage.completion_tokens,
          total_tokens: raw.usage.total_tokens,
        };
      }
      yield chunk;
    }
  }

  private requireClient(): OpenAI {
    if (this.client) return this.client;
    const hint = this.failFastInProd
      ? 'AI Assistant disabled in production.'
      : 'Đặt VILAO_API_KEY trong .env.development rồi restart backend.';
    throw new Error(`Vilao LLM client chưa được cấu hình. ${hint}`);
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        throw new Error('Vilao LLM request aborted');
      }
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (signal?.aborted) throw err;
        const retryable = this.isRetryable(err);
        if (!retryable || attempt === MAX_RETRIES - 1) {
          throw err;
        }
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        this.logger.warn(`${SOFT_ERROR_LOG_PREFIX} retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
        await this.sleep(delay, signal);
      }
    }
    throw lastErr;
  }

  private isRetryable(err: unknown): boolean {
    const anyErr = err as { status?: number; code?: string; response?: { status?: number } };
    const status = anyErr?.status ?? anyErr?.response?.status ?? anyErr?.code;
    if (typeof status === 'number') {
      return status === 429 || status >= 500;
    }
    const message = (err as Error)?.message ?? '';
    return /ECONNRESET|ETIMEDOUT|ENOTFOUND|network|timeout/i.test(message);
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('Vilao LLM request aborted'));
        },
        { once: true },
      );
    });
  }
}
