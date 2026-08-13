import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AiConversation } from '@/entities/ai-conversation.entity';
import { AiConversationDocChunk } from '@/entities/ai-conversation-doc-chunk.entity';
import { AiMessage } from '@/entities/ai-message.entity';
import { MarketsModule } from '@/modules/markets/markets.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantGateway } from './ai-assistant.gateway';
import {
  CONVERSATION_REPOSITORY,
  DOC_CHUNK_REPOSITORY,
} from './domain/ports';
import { TypeOrmAiConversationRepository } from './infrastructure/repositories/conversation.repository';
import { TypeOrmAiDocChunkRepository } from './infrastructure/repositories/embedding.repository';
import { VilaoLlmClient } from './infrastructure/llm/vilao-llm.client';
import { VilaoEmbeddingClient } from './infrastructure/llm/vilao-embedding.client';
import { MarketContextTool } from './infrastructure/tools/market-context.tool';
import { UserContextTool } from './infrastructure/tools/user-context.tool';
import { AiQuotaService } from './application/ai-quota.service';
import { RagRetrievalService } from './application/rag-retrieval.service';
import { ClassifyIntentUseCase } from './application/use-cases/classify-intent.use-case';
import { BuildContextUseCase } from './application/use-cases/build-context.use-case';
import { StreamChatUseCase } from './application/use-cases/stream-chat.use-case';
import { CreateConversationUseCase } from './application/use-cases/create-conversation.use-case';
import { AppendMessageUseCase } from './application/use-cases/append-message.use-case';
import { GetConversationsQuery } from './application/queries/get-conversations.query';
import { SeedAiHelpDocsUseCase } from './application/use-cases/seed-ai-help-docs.use-case';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiConversation, AiMessage, AiConversationDocChunk]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
    MarketsModule,
    OrdersModule,
    WalletsModule,
  ],
  controllers: [AiAssistantController],
  providers: [
    VilaoLlmClient,
    VilaoEmbeddingClient,
    MarketContextTool,
    UserContextTool,
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: TypeOrmAiConversationRepository,
    },
    {
      provide: DOC_CHUNK_REPOSITORY,
      useClass: TypeOrmAiDocChunkRepository,
    },
    AiQuotaService,
    RagRetrievalService,
    ClassifyIntentUseCase,
    BuildContextUseCase,
    StreamChatUseCase,
    CreateConversationUseCase,
    AppendMessageUseCase,
    GetConversationsQuery,
    SeedAiHelpDocsUseCase,
    AiAssistantGateway,
  ],
  exports: [
    VilaoLlmClient,
    VilaoEmbeddingClient,
    SeedAiHelpDocsUseCase,
    StreamChatUseCase,
  ],
})
export class AiAssistantModule {}
