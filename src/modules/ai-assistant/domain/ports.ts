import type {
  AiConversation,
  AiConversationIntent,
  AiDocChunk,
  AiMessage,
  AiMessageRole,
} from './entities/conversation';

export interface ListConversationsOptions {
  userId: string;
  page: number;
  limit: number;
  includeDeleted?: boolean;
}

export interface ListMessagesOptions {
  conversationId: string;
  page: number;
  limit: number;
}

export interface CreateConversationInput {
  userId: string;
  title?: string;
  intent?: AiConversationIntent;
}

export interface AppendMessageInput {
  conversationId: string;
  role: AiMessageRole;
  content: string;
  model?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  toolCalls?: Array<Record<string, unknown>> | null;
  contextRefs?: Array<Record<string, unknown>> | null;
  parentMessageId?: string | null;
}

export const CONVERSATION_REPOSITORY = Symbol('AiConversationRepository');
export const DOC_CHUNK_REPOSITORY = Symbol('AiDocChunkRepository');

export interface AiConversationRepository {
  create(input: CreateConversationInput): Promise<AiConversation>;
  listByUser(opts: ListConversationsOptions): Promise<AiConversation[]>;
  countByUser(opts: ListConversationsOptions): Promise<number>;
  findById(conversationId: string): Promise<AiConversation | null>;
  updateTitle(conversationId: string, title: string): Promise<AiConversation | null>;
  updateLastMessage(conversationId: string, tokensIn: number, tokensOut: number): Promise<void>;
  softDelete(conversationId: string, userId: string): Promise<boolean>;

  appendMessage(input: AppendMessageInput): Promise<AiMessage>;
  listMessages(opts: ListMessagesOptions): Promise<AiMessage[]>;
  countMessages(opts: ListMessagesOptions): Promise<number>;
}

export interface AiDocChunkRepository {
  upsertMany(chunks: Array<Omit<AiDocChunk, 'created_at'>>): Promise<number>;
  listAll(): Promise<AiDocChunk[]>;
  countAll(): Promise<number>;
  deleteAll(): Promise<void>;
}
