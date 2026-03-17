import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  UpdateUserDto,
  UpdateMyProfileBasicDto,
  RequestSecurityChangeDto,
  ReviewSecurityChangeDto,
} from './dto';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
} from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';

/**
 * Users Controller
 * API endpoints cho user management
 */
@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(JwtAuthGuard) // All routes require authentication
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get all users (with pagination)
   * GET /users?page=1&limit=10
   */
  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Retrieve a paginated list of all users',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.SUPPORT_AGENT, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.USERS_READ)
  @ApiSuccessResponse('Users retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findAll(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 10,
  ) {
    return this.usersService.findAll(page, limit);
  }

  /**
   * Get user statistics
   * GET /users/statistics
   */
  @Get('statistics')
  @ApiOperation({
    summary: 'Get user statistics',
    description: 'Retrieve statistics about users in the system',
  })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.SUPPORT_AGENT, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.USERS_READ)
  @ApiSuccessResponse('Statistics retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async getStatistics() {
    return this.usersService.getStatistics();
  }

  /**
   * Get current user profile
   * GET /users/me
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieve the authenticated user\'s profile information',
  })
  @ApiSuccessResponse('User profile retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async getCurrentUser(@CurrentUser('userId') userId: string) {
    return this.usersService.findOne(userId);
  }

  /**
   * Update current user profile basic (first_name, last_name) — no approval
   * PATCH /users/me/profile-basic
   */
  @Patch('me/profile-basic')
  @ApiOperation({
    summary: 'Update profile basic',
    description: 'Update first name and last name (no approval required)',
  })
  @ApiBody({ type: UpdateMyProfileBasicDto })
  @ApiSuccessResponse('Profile basic updated successfully')
  @ApiBadRequestResponse('Invalid input')
  @ApiUnauthorizedResponse('Unauthorized')
  async updateProfileBasic(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateMyProfileBasicDto,
  ) {
    return this.usersService.updateProfileBasic(userId, dto);
  }

  /**
   * Create security change request (email/password) — requires reviewer approval
   * POST /users/me/security-change-requests
   */
  @Post('me/security-change-requests')
  @ApiOperation({
    summary: 'Request security change',
    description: 'Submit email or password change request (pending approval)',
  })
  @ApiBody({ type: RequestSecurityChangeDto })
  @ApiSuccessResponse('Security change request created')
  @ApiBadRequestResponse('Invalid input or email exists')
  @ApiUnauthorizedResponse('Unauthorized')
  async requestSecurityChange(
    @CurrentUser('userId') userId: string,
    @Body() dto: RequestSecurityChangeDto,
  ) {
    return this.usersService.requestSecurityChange(userId, dto);
  }

  /**
   * Upload avatar image (multipart/form-data, field name: file)
   * POST /users/me/avatar
   */
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPEG, PNG, WebP images allowed'), false);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload avatar',
    description: 'Upload profile avatar image (max 2MB, JPEG/PNG/WebP)',
  })
  @ApiSuccessResponse('Avatar updated')
  @ApiBadRequestResponse('Invalid file or size')
  @ApiUnauthorizedResponse('Unauthorized')
  async uploadAvatar(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('No file uploaded. Use field name: file.');
    }
    return this.usersService.uploadAvatar(userId, file.buffer);
  }

  /**
   * Get pending security change requests (reviewer only)
   * GET /users/security-change-requests/pending
   */
  @Get('security-change-requests/pending')
  @ApiOperation({
    summary: 'List pending security change requests',
    description: 'For admins/risk officers to review',
  })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequirePermissions(Permission.USERS_SECURITY_REVIEW)
  @ApiSuccessResponse('Pending requests retrieved')
  @ApiUnauthorizedResponse('Unauthorized')
  async getPendingSecurityChangeRequests() {
    return this.usersService.getPendingSecurityChangeRequests();
  }

  /**
   * Approve a security change request
   * POST /users/security-change-requests/:id/approve
   */
  @Post('security-change-requests/:id/approve')
  @ApiOperation({ summary: 'Approve security change request' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  @ApiBody({ type: ReviewSecurityChangeDto })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequirePermissions(Permission.USERS_SECURITY_REVIEW)
  @ApiSuccessResponse('Request approved')
  @ApiNotFoundResponse('Request not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async approveSecurityChangeRequest(
    @Param('id') requestId: string,
    @CurrentUser('userId') reviewerUserId: string,
    @Body() dto: ReviewSecurityChangeDto,
  ) {
    return this.usersService.reviewSecurityChangeRequest(requestId, reviewerUserId, {
      ...dto,
      approve: true,
    });
  }

  /**
   * Reject a security change request
   * POST /users/security-change-requests/:id/reject
   */
  @Post('security-change-requests/:id/reject')
  @ApiOperation({ summary: 'Reject security change request' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  @ApiBody({ type: ReviewSecurityChangeDto })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequirePermissions(Permission.USERS_SECURITY_REVIEW)
  @ApiSuccessResponse('Request rejected')
  @ApiNotFoundResponse('Request not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async rejectSecurityChangeRequest(
    @Param('id') requestId: string,
    @CurrentUser('userId') reviewerUserId: string,
    @Body() dto: ReviewSecurityChangeDto,
  ) {
    return this.usersService.reviewSecurityChangeRequest(requestId, reviewerUserId, {
      ...dto,
      approve: false,
    });
  }

  /**
   * Get user by ID
   * GET /users/:id
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieve a specific user by their ID',
  })
  @ApiParam({ name: 'id', type: String, example: '018e9a7b-1234-7abc-8000-000000000001' })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.SUPPORT_AGENT, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.USERS_READ)
  @ApiSuccessResponse('User retrieved successfully')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * Update current user
   * PATCH /users/me
   */
  @Patch('me')
  @ApiOperation({
    summary: 'Update current user',
    description: 'Update the authenticated user\'s profile information',
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiSuccessResponse('User updated successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiUnauthorizedResponse('Unauthorized')
  async updateCurrentUser(
    @CurrentUser('userId') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(userId, updateUserDto);
  }

  /**
   * Update user by ID (Admin only - TODO: Add role guard)
   * PATCH /users/:id
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update user by ID',
    description: 'Update a specific user by their ID (Admin only)',
  })
  @ApiParam({ name: 'id', type: String, example: '018e9a7b-1234-7abc-8000-000000000001' })
  @ApiBody({ type: UpdateUserDto })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @RequirePermissions(Permission.USERS_MANAGE)
  @ApiSuccessResponse('User updated successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * Delete user (Admin only - TODO: Add role guard)
   * DELETE /users/:id
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete user by ID',
    description: 'Delete a specific user by their ID (Admin only)',
  })
  @ApiParam({ name: 'id', type: String, example: '018e9a7b-1234-7abc-8000-000000000001' })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @RequirePermissions(Permission.USERS_MANAGE)
  @ApiSuccessResponse('User deleted successfully')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { message: 'User deleted successfully' };
  }
}
