import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AI_CONVERSATION_INTENTS } from '../domain/entities/conversation';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @IsIn(AI_CONVERSATION_INTENTS)
  intent?: 'guide' | 'market' | 'trading' | 'rag' | 'general';

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  firstMessage?: string;
}
