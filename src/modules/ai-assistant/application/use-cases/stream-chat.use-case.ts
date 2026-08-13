import { Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { VilaoLlmClient, ChatMessage, ChatRequest } from '../../infrastructure/llm/vilao-llm.client';
import { CONVERSATION_REPOSITORY } from '../../domain/ports';
import { Inject } from '@nestjs/common';
import type { AiConversationRepository } from '../../domain/ports';
import { BuildContextUseCase } from './build-context.use-case';
import { ClassifyIntentUseCase } from './classify-intent.use-case';
import { AiQuotaService } from '../ai-quota.service';
import { runInSpan } from '@/common/telemetry';

export interface StreamChatInput {
  userId: string;
  conversationId?: string;
  userText: string;
  /** Optional: abort when client sends `chat:stop`. */
  signal?: AbortSignal;
  /** Receives streamed events. Resolves when the stream ends. */
  onEvent: (event: StreamChatEvent) => Promise<void> | void;
}

export type StreamChatEvent =
  | { type: 'start'; conversationId: string; userMessageId: string }
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'done'; assistantMessageId: string; tokensIn: number; tokensOut: number; model: string }
  | { type: 'error'; code: string; message: string };

const MAX_TOOL_ITERATIONS = 3;
const MAX_OUTPUT_TOKENS = 800;

@Injectable()
export class StreamChatUseCase {
  private readonly logger = new Logger(StreamChatUseCase.name);

  constructor(
    private readonly llm: VilaoLlmClient,
    private readonly buildContext: BuildContextUseCase,
    private readonly classifyIntent: ClassifyIntentUseCase,
    private readonly quota: AiQuotaService,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repo: AiConversationRepository,
  ) {}

  async execute(input: StreamChatInput): Promise<void> {
    if (!this.llm.isConfigured) {
      await input.onEvent({
        type: 'error',
        code: 'LLM_NOT_CONFIGURED',
        message: 'AI Assistant chưa được cấu hình (thiếu VILAO_API_KEY).',
      });
      return;
    }

    return runInSpan('ai-assistant.stream-chat', async () => {
      const rateCheck = await this.quota.checkRateLimit(input.userId);
      if (!rateCheck.allowed) {
        await input.onEvent({ type: 'error', code: 'RATE_LIMITED', message: rateCheck.reason ?? 'Rate limited' });
        return;
      }

      const acquired = await this.quota.acquireActiveStream(input.userId);
      if (!acquired) {
        await input.onEvent({
          type: 'error',
          code: 'STREAM_BUSY',
          message: 'Bạn đang có 1 yêu cầu AI đang xử lý. Vui lòng đợi hoặc dừng trước khi gửi tiếp.',
        });
        return;
      }

      try {
        const conversation = await this.ensureConversation(input);
        const context = await this.buildContext.execute({
          userId: input.userId,
          conversationId: conversation.conversation_id,
          userText: input.userText,
        });

        if (context.pii.containsPii) {
          const refusal = BuildContextUseCase.refusalMessage(context.pii);
          const assistantMessageId = uuidv7();
          await this.repo.appendMessage({
            conversationId: conversation.conversation_id,
            role: 'assistant',
            content: refusal,
            model: null,
            tokensIn: 0,
            tokensOut: 0,
            contextRefs: [{ type: 'pii_refusal', reasons: context.pii.reasons }],
          });
          await this.repo.updateLastMessage(conversation.conversation_id, 0, 0);
          await input.onEvent({ type: 'start', conversationId: conversation.conversation_id, userMessageId: '' });
          await input.onEvent({ type: 'token', delta: refusal });
          await input.onEvent({
            type: 'done',
            assistantMessageId,
            tokensIn: 0,
            tokensOut: 0,
            model: 'pii-refusal',
          });
          return;
        }

        const userMessage = await this.repo.appendMessage({
          conversationId: conversation.conversation_id,
          role: 'user',
          content: input.userText,
        });
        await this.repo.updateLastMessage(conversation.conversation_id, 0, 0);

        // If this conversation was just created, derive a short title from the
        // first user message so the list screen shows meaningful summaries.
        if (!input.conversationId) {
          const derivedTitle = deriveTitle(input.userText);
          if (derivedTitle) {
            await this.repo.updateTitle(conversation.conversation_id, derivedTitle);
            conversation.title = derivedTitle;
          }
        }

        await input.onEvent({
          type: 'start',
          conversationId: conversation.conversation_id,
          userMessageId: userMessage.message_id,
        });

        const messages: ChatMessage[] = [
          { role: 'system', content: context.systemPrompt },
          ...context.messages.map((m) => ({ role: m.role, content: m.content })),
        ];

        const toolHandlers = this.buildContext.getToolHandlers();
        const allToolCalls: Array<Record<string, unknown>> = [];

        let totalTokensIn = 0;
        let totalTokensOut = 0;
        let lastModel = this.llm.getDefaultModel();
        let finalContent = '';

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          if (input.signal?.aborted) break;

          const req: ChatRequest = {
            messages,
            tools: context.tools,
            tool_choice: 'auto',
            max_tokens: MAX_OUTPUT_TOKENS,
            signal: input.signal,
          };

          let response;
          try {
            response = await this.llm.chat(req);
          } catch (err) {
            const msg = (err as Error).message ?? 'LLM error';
            await input.onEvent({ type: 'error', code: 'LLM_ERROR', message: msg });
            return;
          }

          totalTokensIn += response.tokens_in;
          totalTokensOut += response.tokens_out;
          lastModel = response.model;

          const toolCalls = response.tool_calls ?? [];
          if (toolCalls.length > 0) {
            messages.push({ role: 'assistant', content: response.content, tool_calls: toolCalls });
            for (const tc of toolCalls) {
              const fn = (tc as { function?: { name?: string; arguments?: string } }).function;
              const name = fn?.name ?? '';
              const argsStr = fn?.arguments ?? '{}';
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = argsStr ? (JSON.parse(argsStr) as Record<string, unknown>) : {};
              } catch {
                parsedArgs = {};
              }
              await input.onEvent({ type: 'tool_call', name, args: parsedArgs });
              const handler = toolHandlers[name];
              let result: unknown;
              try {
                result = handler
                  ? await handler(parsedArgs, input.userId)
                  : { error: `Unknown tool: ${name}` };
              } catch (err) {
                result = { error: (err as Error).message };
              }
              await input.onEvent({ type: 'tool_result', name, result });
              const toolCallId = (tc as { id?: string }).id ?? uuidv7();
              messages.push({
                role: 'tool',
                name,
                content: JSON.stringify(result),
                tool_call_id: toolCallId,
              });
              allToolCalls.push({ name, args: parsedArgs, result });
            }
            continue;
          }

          finalContent = response.content;
          for (const token of chunkForStreaming(finalContent)) {
            if (input.signal?.aborted) break;
            await input.onEvent({ type: 'token', delta: token });
          }
          break;
        }

        const assistantMessageId = uuidv7();
        await this.repo.appendMessage({
          conversationId: conversation.conversation_id,
          role: 'assistant',
          content: finalContent,
          model: lastModel,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
          contextRefs: context.contextRefs,
          parentMessageId: userMessage.message_id,
        });
        await this.repo.updateLastMessage(conversation.conversation_id, totalTokensIn, totalTokensOut);
        await this.quota.recordUsage(input.userId, totalTokensIn, totalTokensOut);

        await input.onEvent({
          type: 'done',
          assistantMessageId,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          model: lastModel,
        });
      } finally {
        await this.quota.releaseActiveStream(input.userId);
      }
    });
  }

  private async ensureConversation(input: StreamChatInput) {
    if (input.conversationId) {
      const existing = await this.repo.findById(input.conversationId);
      if (existing && existing.user_id === input.userId && !existing.deleted_at) {
        return existing;
      }
    }
    return this.repo.create({ userId: input.userId, intent: 'general' });
  }
}

function chunkForStreaming(content: string): string[] {
  if (!content) return [];
  const tokens = content.match(/\S+\s*|\s+/g) ?? [content];
  return tokens;
}

/**
 * Derive a short, human-readable conversation title from the first user
 * message. Strips whitespace, removes question marks, and truncates to ~50
 * characters. Falls back to a default if the input is unusable.
 */
function deriveTitle(text: string, maxLen = 50): string {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Cuộc hội thoại mới';
  // Drop trailing punctuation so titles don't end with "?".
  const stripped = cleaned.replace(/[?.!,;:\u2026]+\s*$/u, '').trim();
  const candidate = stripped || cleaned;
  if (candidate.length <= maxLen) return capitalize(candidate);
  return capitalize(candidate.slice(0, maxLen - 1).trimEnd()) + '…';
}

function capitalize(s: string): string {
  if (!s) return s;
  // Preserve leading diacritics (Vietnamese) while upper-casing the first
  // letter char.
  const chars = Array.from(s);
  chars[0] = chars[0].toLocaleUpperCase();
  return chars.join('');
}
