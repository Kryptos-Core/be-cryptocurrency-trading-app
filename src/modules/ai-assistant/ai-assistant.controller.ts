import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiBadRequestResponse,
  ApiSuccessResponse,
  ApiUnauthorizedResponse,
  CurrentUser,
  RequirePermissions,
} from '@/common/decorators';
import { Permission } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard } from '@/common/guards';
import { CreateConversationUseCase } from './application/use-cases/create-conversation.use-case';
import { AppendMessageUseCase } from './application/use-cases/append-message.use-case';
import { GetConversationsQuery } from './application/queries/get-conversations.query';
import { VilaoLlmClient } from './infrastructure/llm/vilao-llm.client';
import { AiQuotaService } from './application/ai-quota.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  ConversationResponseDto,
  ConversationWithMessagesDto,
  MessageResponseDto,
} from './dto/conversation.dto';

@ApiTags('ai-assistant')
@ApiBearerAuth('JWT-auth')
@Controller('ai-assistant')
@UseGuards(JwtAuthGuard)
export class AiAssistantController {
  constructor(
    private readonly createConversation: CreateConversationUseCase,
    private readonly appendMessage: AppendMessageUseCase,
    private readonly getConversations: GetConversationsQuery,
    private readonly llm: VilaoLlmClient,
    private readonly quota: AiQuotaService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'AI Assistant status (feature flag, usage)' })
  @ApiSuccessResponse('Status retrieved')
  async status(@CurrentUser('userId') userId: string) {
    const [remaining, used] = await Promise.all([
      this.quota.getRemainingDailyBudget(userId),
      this.quota.getDailyUsage(userId),
    ]);
    return {
      enabled: this.llm.isConfigured,
      model: this.llm.isConfigured ? this.llm.getDefaultModel() : null,
      daily_remaining_tokens: remaining,
      daily_used_tokens: used,
    };
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List my AI conversations (paginated)' })
  @ApiSuccessResponse('Conversations retrieved')
  @ApiUnauthorizedResponse('Unauthorized')
  async list(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const result = await this.getConversations.execute({
      userId,
      page: Math.max(Number(page) || 1, 1),
      limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
    });
    return {
      items: result.items.map(ConversationResponseDto.from),
      page: result.page,
      limit: result.limit,
      total: result.total,
    };
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Create a new AI conversation' })
  @ApiSuccessResponse('Conversation created')
  @ApiBadRequestResponse('Invalid input')
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    const conv = await this.createConversation.execute({
      userId,
      title: dto.title,
      intent: dto.intent,
      firstMessage: dto.firstMessage,
    });
    return ConversationResponseDto.from(conv);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get a conversation with messages' })
  @ApiSuccessResponse('Conversation retrieved')
  async getOne(
    @CurrentUser('userId') userId: string,
    @Param('id') conversationId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    const result = await this.getConversations.getConversationWithMessages({
      conversationId,
      userId,
      page: Math.max(Number(page) || 1, 1),
      limit: Math.min(Math.max(Number(limit) || 100, 1), 500),
    });
    return ConversationWithMessagesDto.from(
      result.conversation,
      result.items,
      result.total,
      result.page,
      result.limit,
    );
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'List messages of a conversation (paginated)' })
  async listMessages(
    @CurrentUser('userId') userId: string,
    @Param('id') conversationId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    const result = await this.getConversations.getConversationWithMessages({
      conversationId,
      userId,
      page: Math.max(Number(page) || 1, 1),
      limit: Math.min(Math.max(Number(limit) || 100, 1), 500),
    });
    return {
      items: result.items.map(MessageResponseDto.from),
      page: result.page,
      limit: result.limit,
      total: result.total,
    };
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Append a message (non-streaming, for testing/E2E)' })
  @ApiSuccessResponse('Message appended')
  async sendMessage(
    @CurrentUser('userId') userId: string,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    const msg = await this.appendMessage.execute({
      conversationId,
      userId,
      role: 'user',
      content: dto.content,
    });
    return MessageResponseDto.from(msg);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a conversation' })
  async remove(
    @CurrentUser('userId') userId: string,
    @Param('id') conversationId: string,
  ) {
    await this.getConversations.softDelete(conversationId, userId);
  }
}
