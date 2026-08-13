export type AiConversationIntent =
  | 'guide'
  | 'market'
  | 'trading'
  | 'rag'
  | 'general';

export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export const AI_CONVERSATION_INTENTS: AiConversationIntent[] = [
  'guide',
  'market',
  'trading',
  'rag',
  'general',
];

export const AI_MESSAGE_ROLES: AiMessageRole[] = [
  'system',
  'user',
  'assistant',
  'tool',
];

export interface AiConversation {
  conversation_id: string;
  user_id: string;
  title: string;
  intent: AiConversationIntent;
  last_message_at: Date | null;
  message_count: number;
  total_tokens_in: number;
  total_tokens_out: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AiMessage {
  message_id: string;
  conversation_id: string;
  role: AiMessageRole;
  content: string;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  tool_calls: Array<Record<string, unknown>> | null;
  context_refs: Array<Record<string, unknown>> | null;
  parent_message_id: string | null;
  created_at: Date;
}

export interface AiDocChunk {
  chunk_id: string;
  source: 'help_center' | 'faq' | 'docs' | 'manual';
  source_id: string;
  title: string;
  chunk_text: string;
  embedding: number[];
  token_count: number;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}
