import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

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

const DEFAULT_BASE_URL = 'https://api.vilao.ai';
const DEFAULT_MODEL = 'ccf/claude-sonnet-5';
const DEFAULT_FAST_MODEL = 'ccf/claude-haiku-4-5-20251001';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
const REQUEST_TIMEOUT_MS = 60_000; // hard upper bound per attempt
const SOFT_ERROR_LOG_PREFIX = '[vilao-llm] soft error';
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Vilao LLM client — Anthropic-compatible Claude provider.
 *
 * Vilao.ai exposes its Claude (`ccf/*`) models via the Anthropic Messages API
 * (`POST /v1/messages`). We use the official `@anthropic-ai/sdk` with a
 * custom `baseURL` so requests are routed to Vilao's gateway while keeping
 * the rest of the application code unaware of the provider.
 *
 * Returns graceful degradation when the API key is missing so the rest of the
 * app can still boot (dev) or fail fast (production) per `failFastInProd`.
 */
@Injectable()
export class VilaoLlmClient {
  private readonly logger = new Logger(VilaoLlmClient.name);
  private readonly client: Anthropic | null;
  private readonly defaultModel: string;
  private readonly fastModel: string;
  private readonly failFastInProd: boolean;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('VILAO_API_KEY')?.trim();
    const baseURL =
      configService.get<string>('VILAO_BASE_URL')?.replace(/\/v1\/?$/, '') ?? DEFAULT_BASE_URL;
    this.defaultModel =
      configService.get<string>('VILAO_DEFAULT_MODEL') ?? DEFAULT_MODEL;
    this.fastModel =
      configService.get<string>('VILAO_FAST_MODEL') ?? DEFAULT_FAST_MODEL;
    this.failFastInProd = (configService.get<string>('NODE_ENV') ?? 'development') === 'production';

    if (!apiKey) {
      this.logger.warn(
        'VILAO_API_KEY chưa được cấu hình — AI Assistant sẽ trả lỗi cho mọi request. Xem docs/vilao.ai/VilaoLLM.md.',
      );
      this.client = null;
    } else {
      this.client = new Anthropic({ apiKey, baseURL });
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
   *
   * Translates our OpenAI-flavoured `ChatMessage`/`ChatTool` input into the
   * Anthropic Messages API format (system prompt as a top-level field,
   * tools wrapped in `{ name, description, input_schema }`, tool messages
   * converted to Anthropic `tool_result` blocks).
   */
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const client = this.requireClient();
    const model = req.model ?? this.defaultModel;
    const { system, messages } = splitSystemPrompt(req.messages);
    const tools = req.tools?.map(toAnthropicTool);

    // Combine caller-provided AbortSignal with an internal timeout so the
    // gateway never hangs forever on a stalled upstream.
    const combinedSignal = mergeAbortSignals(req.signal, REQUEST_TIMEOUT_MS);

    const response = await this.withRetry(
      () =>
        client.messages.create({
          model,
          system,
          messages: messages as Anthropic.MessageParam[],
          tools,
          tool_choice: req.tool_choice
            ? toAnthropicToolChoice(req.tool_choice)
            : (tools ? { type: 'auto' } : undefined),
          temperature: req.temperature ?? 0.7,
          max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS,
        }),
      combinedSignal.signal,
    );

    return fromAnthropicResponse(response);
  }

  /**
   * Streaming chat completion. Returns an async iterable of chunks.
   * The final chunk carries `usage` (when the upstream reports it).
   */
  async *streamChat(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const client = this.requireClient();
    const model = req.model ?? this.defaultModel;
    const { system, messages } = splitSystemPrompt(req.messages);
    const tools = req.tools?.map(toAnthropicTool);

    const stream = client.messages.stream({
      model,
      system,
      messages: messages as Anthropic.MessageParam[],
      tools,
      tool_choice: req.tool_choice
        ? toAnthropicToolChoice(req.tool_choice)
        : (tools ? { type: 'auto' } : undefined),
      temperature: req.temperature ?? 0.7,
      max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS,
    });

    // Add an internal timeout on top of the caller signal so iterators
    // never sit idle waiting on stalled upstream connections.
    const combinedSignal = mergeAbortSignals(req.signal, REQUEST_TIMEOUT_MS);

    try {
      for await (const event of stream) {
        if (combinedSignal.signal.aborted) {
          throw new Error('Vilao LLM stream aborted');
        }
        if (event.type === 'content_block_delta' && 'delta' in event) {
          const delta = (event.delta as { type?: string; text?: string }).text ?? '';
          yield { delta };
        } else if (event.type === 'message_stop') {
          const finalMessage = await stream.finalMessage();
          const usage = finalMessage.usage;
          yield {
            delta: '',
            finish_reason: finalMessage.stop_reason ?? 'end_turn',
            usage: {
              prompt_tokens: usage.input_tokens,
              completion_tokens: usage.output_tokens,
              total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
            },
          };
          return;
        }
      }
    } finally {
      combinedSignal.dispose();
    }
  }

  private requireClient(): Anthropic {
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

/**
 * Combine a caller-supplied AbortSignal with an internal timeout. Either
 * signal aborts the underlying fetch; the internal timer is cleared on
 * completion so the Node process can exit cleanly.
 */
function mergeAbortSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Vilao LLM request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const onAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) {
      controller.abort(external.reason);
    } else {
      external.addEventListener('abort', onAbort, { once: true });
    }
  }
  const dispose = () => {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', onAbort);
  };
  return { signal: controller.signal, dispose };
}

function splitSystemPrompt(messages: ChatMessage[]): {
  system: string | undefined;
  messages: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const rest: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      rest.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.tool_call_id ?? '',
            content: m.content,
          },
        ],
      });
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content) {
        content.push({ type: 'text', text: m.content });
      }
      for (const tc of m.tool_calls) {
        const fn = (tc as { id?: string; function?: { name?: string; arguments?: string } }).function;
        const id = (tc as { id?: string }).id ?? fn?.name ?? '';
        let parsedInput: Record<string, unknown> = {};
        if (fn?.arguments) {
          try {
            parsedInput = JSON.parse(fn.arguments) as Record<string, unknown>;
          } catch {
            parsedInput = {};
          }
        }
        content.push({
          type: 'tool_use',
          id,
          name: fn?.name ?? '',
          input: parsedInput,
        });
      }
      rest.push({ role: 'assistant', content });
      continue;
    }
    rest.push({ role: m.role, content: m.content });
  }
  const system = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
  return { system, messages: rest };
}

function toAnthropicTool(tool: ChatTool): Anthropic.Tool {
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters as Anthropic.Tool.InputSchema,
  };
}

function toAnthropicToolChoice(
  choice: NonNullable<ChatRequest['tool_choice']>,
): Anthropic.ToolChoice {
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'any' };
  return { type: 'tool', name: choice.function.name };
}

function fromAnthropicResponse(response: Anthropic.Message): ChatResponse {
  let text = '';
  const toolCalls: Array<Record<string, unknown>> = [];
  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }
  return {
    content: text,
    model: response.model,
    tokens_in: response.usage.input_tokens,
    tokens_out: response.usage.output_tokens,
    finish_reason: response.stop_reason ?? 'end_turn',
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}