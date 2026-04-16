import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ApiBadRequestResponse,
  ApiSuccessResponse,
  ApiUnauthorizedResponse,
  CurrentUser,
  RequirePermissions,
} from '@/common/decorators';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { GetNotificationsQuery } from './application/queries/get-notifications.query';
import { BroadcastNotificationUseCase } from './application/use-cases/broadcast-notification.use-case';
import { MarkAllNotificationsReadUseCase } from './application/use-cases/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from './application/use-cases/mark-notification-read.use-case';
import { CreateNotificationDto } from './dto/create-notification.dto';
import type { NotificationQueryDto } from './dto/notification-query.dto';

/**
 * Notifications Controller
 * REST API for notification management.
 * POST /notifications — ADMIN only (notifications:broadcast permission)
 * GET/PATCH — any authenticated user (own notifications)
 */
@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly getNotificationsQuery: GetNotificationsQuery,
    private readonly broadcastNotificationUseCase: BroadcastNotificationUseCase,
    private readonly markNotificationReadUseCase: MarkNotificationReadUseCase,
    private readonly markAllNotificationsReadUseCase: MarkAllNotificationsReadUseCase,
  ) {}

  /**
   * POST /notifications
   * ADMIN broadcasts a notification to all users.
   */
  @Post()
  @ApiOperation({ summary: 'Broadcast notification to all users (ADMIN only)' })
  @ApiBody({ type: CreateNotificationDto })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @RequirePermissions(Permission.NOTIFICATIONS_BROADCAST)
  @ApiSuccessResponse('Notification broadcasted')
  @ApiBadRequestResponse('Invalid input')
  @ApiUnauthorizedResponse('Unauthorized')
  async broadcast(@Body() dto: CreateNotificationDto, @CurrentUser('userId') adminId: string) {
    return this.broadcastNotificationUseCase.execute(dto, adminId);
  }

  /**
   * GET /notifications
   * Authenticated user fetches their own notification list (paginated).
   */
  @Get()
  @ApiOperation({ summary: 'Get my notifications (paginated)' })
  @ApiSuccessResponse('Notifications retrieved')
  @ApiUnauthorizedResponse('Unauthorized')
  async findMyNotifications(
    @CurrentUser('userId') userId: string,
    @Query() query: NotificationQueryDto,
  ) {
    return this.getNotificationsQuery.findByUser(userId, query);
  }

  /**
   * GET /notifications/unread-count
   * Returns the unread notification count for the current user (used for badge).
   */
  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiSuccessResponse('Unread count retrieved')
  @ApiUnauthorizedResponse('Unauthorized')
  async getUnreadCount(@CurrentUser('userId') userId: string) {
    return this.getNotificationsQuery.countUnread(userId);
  }

  /**
   * PATCH /notifications/read-all
   * Mark all notifications as read for the current user.
   */
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiSuccessResponse('All notifications marked as read')
  @ApiUnauthorizedResponse('Unauthorized')
  async markAllRead(@CurrentUser('userId') userId: string) {
    return this.markAllNotificationsReadUseCase.execute(userId);
  }

  /**
   * PATCH /notifications/:id/read
   * Mark a single notification as read.
   */
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID (UUID)' })
  @ApiSuccessResponse('Notification marked as read')
  @ApiUnauthorizedResponse('Unauthorized')
  async markRead(@Param('id') notificationId: string, @CurrentUser('userId') userId: string) {
    return this.markNotificationReadUseCase.execute(notificationId, userId);
  }
}
