import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { CurrentUser, RequirePermissions } from '@/common/decorators';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@/common/decorators';

/**
 * Notifications Controller
 * REST API for notification management.
 * POST /notifications  — ADMIN only (notifications:broadcast permission)
 * GET/PATCH            — any authenticated user (own notifications)
 */
@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
  async broadcast(
    @Body() dto: CreateNotificationDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.notificationsService.broadcast(dto, adminId);
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
    return this.notificationsService.findByUser(userId, query);
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
    return this.notificationsService.countUnread(userId);
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
    return this.notificationsService.markAllRead(userId);
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
  async markRead(
    @Param('id') notificationId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.notificationsService.markRead(notificationId, userId);
  }
}
