import { ApiProperty } from '@nestjs/swagger';
import type { AiConversation, AiMessage } from '../domain/entities/conversation';

export class ConversationResponseDto {
  @ApiProperty()
  conversation_id!: string;
  @ApiProperty()
  user_id!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty()
  intent!: AiConversation['intent'];
  @ApiProperty()
  last_message_at!: Date | null;
  @ApiProperty()
  message_count!: number;
  @ApiProperty()
  total_tokens_in!: number;
  @ApiProperty()
  total_tokens_out!: number;
  @ApiProperty()
  created_at!: Date;
  @ApiProperty()
  updated_at!: Date;

  static from(conv: AiConversation): ConversationResponseDto {
    return {
      conversation_id: conv.conversation_id,
      user_id: conv.user_id,
      title: conv.title,
      intent: conv.intent,
      last_message_at: conv.last_message_at,
      message_count: conv.message_count,
      total_tokens_in: conv.total_tokens_in,
      total_tokens_out: conv.total_tokens_out,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
    };
  }
}

export class MessageResponseDto {
  @ApiProperty()
  message_id!: string;
  @ApiProperty()
  conversation_id!: string;
  @ApiProperty()
  role!: AiMessage['role'];
  @ApiProperty()
  content!: string;
  @ApiProperty()
  model!: string | null;
  @ApiProperty()
  tokens_in!: number;
  @ApiProperty()
  tokens_out!: number;
  @ApiProperty()
  tool_calls!: unknown[] | null;
  @ApiProperty()
  context_refs!: unknown[] | null;
  @ApiProperty()
  parent_message_id!: string | null;
  @ApiProperty()
  created_at!: Date;

  static from(msg: AiMessage): MessageResponseDto {
    return {
      message_id: msg.message_id,
      conversation_id: msg.conversation_id,
      role: msg.role,
      content: msg.content,
      model: msg.model,
      tokens_in: msg.tokens_in,
      tokens_out: msg.tokens_out,
      tool_calls: msg.tool_calls,
      context_refs: msg.context_refs,
      parent_message_id: msg.parent_message_id,
      created_at: msg.created_at,
    };
  }
}

export class ConversationWithMessagesDto {
  conversation!: ConversationResponseDto;
  messages!: MessageResponseDto[];
  total!: number;
  page!: number;
  limit!: number;

  static from(conv: AiConversation, messages: AiMessage[], total: number, page: number, limit: number): ConversationWithMessagesDto {
    return {
      conversation: ConversationResponseDto.from(conv),
      messages: messages.map(MessageResponseDto.from),
      total,
      page,
      limit,
    };
  }
}
