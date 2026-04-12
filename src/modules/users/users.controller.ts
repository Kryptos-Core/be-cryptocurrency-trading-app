import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiSuccessResponse,
  ApiUnauthorizedResponse,
  CurrentUser,
  RequireAdminOrSupport,
  RequireFinanceAccess,
} from '@/common/decorators';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { ContactEmailVerificationService } from './contact-email-verification.service';
import {
  RequestSecurityChangeDto,
  ReviewSecurityChangeDto,
  SendContactEmailOtpDto,
  UpdateMyProfileBasicDto,
  UpdateUserDto,
  type UserFilterDto,
  VerifyContactEmailDto,
} from './dto';
import { UsersService } from './users.service';

/**
 * Users Controller
 * API endpoints cho user management
 */
@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(JwtAuthGuard) // All routes require authentication
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly contactEmailVerificationService: ContactEmailVerificationService,
  ) {}

  /**
   * Get all users with search/filter/sort
   * GET /users?page=1&limit=20&search=nguyen&role=TRADER&status=ACTIVE&sortBy=created_at&sortOrder=DESC
   */
  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Retrieve a filtered, sorted, paginated list of users',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search email, first_name, last_name',
  })
  @ApiQuery({ name: 'email', required: false, type: String, description: 'Exact email match' })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['TRADER', 'ADMIN', 'RISK_OFFICER', 'SUPPORT_AGENT', 'MARKET_MAKER', 'FINANCE_MANAGER'],
  })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'BANNED', 'PENDING'] })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['created_at', 'email', 'first_name'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireAdminOrSupport()
  @RequirePermissions(Permission.USERS_READ)
  @ApiSuccessResponse('Users retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findAll(@Query() filters: UserFilterDto) {
    return this.usersService.findAll(filters);
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
  @RequireAdminOrSupport()
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
    description: "Retrieve the authenticated user's profile information",
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
   * Gửi OTP tới email mới (chỉ user ví / email @*.wallet).
   * POST /users/me/contact-email/send-otp
   */
  @Post('me/contact-email/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send contact email verification OTP',
    description:
      'Sends a 6-digit OTP to the new address. Only for accounts with a wallet placeholder email.',
  })
  @ApiBody({ type: SendContactEmailOtpDto })
  @ApiSuccessResponse('OTP sent')
  @ApiBadRequestResponse('Invalid email or cooldown')
  @ApiUnauthorizedResponse('Unauthorized')
  async sendContactEmailOtp(
    @CurrentUser('userId') userId: string,
    @Body() dto: SendContactEmailOtpDto,
  ) {
    return this.contactEmailVerificationService.sendOtp(userId, dto.email);
  }

  /**
   * Xác minh OTP và cập nhật email đăng nhập sang địa chỉ mới.
   * POST /users/me/contact-email/verify
   */
  @Post('me/contact-email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify contact email OTP',
    description: 'Validates OTP sent to the new email and updates the user email.',
  })
  @ApiBody({ type: VerifyContactEmailDto })
  @ApiSuccessResponse('Email updated')
  @ApiBadRequestResponse('Invalid or expired OTP')
  @ApiUnauthorizedResponse('Unauthorized')
  async verifyContactEmail(
    @CurrentUser('userId') userId: string,
    @Body() dto: VerifyContactEmailDto,
  ) {
    return this.contactEmailVerificationService.verifyAndUpdateEmail(
      userId,
      dto.email,
      dto.otpCode,
    );
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
   * Get wallet balances for a specific user (Admin / Risk Officer / Finance Manager)
   * GET /users/:id/wallets
   */
  @Get(':id/wallets')
  @ApiOperation({
    summary: 'Get user wallets',
    description: 'Retrieve all wallet balances for a specific user (admin view)',
  })
  @ApiParam({ name: 'id', type: String, example: '018e9a7b-1234-7abc-8000-000000000001' })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiSuccessResponse('User wallets retrieved successfully')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getUserWallets(@Param('id') id: string) {
    return this.usersService.getUserWallets(id);
  }

  /**
   * Get onchain transaction history for a specific user (Admin / Risk Officer)
   * GET /users/:id/onchain-transactions?page=1&limit=20
   */
  @Get(':id/onchain-transactions')
  @ApiOperation({
    summary: 'Get user onchain transactions',
    description: 'Retrieve paginated onchain transaction history for a specific user',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireAdminOrSupport()
  @RequirePermissions(Permission.USERS_READ)
  @ApiSuccessResponse('Onchain transactions retrieved successfully')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getUserOnchainTransactions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.usersService.getUserOnchainTransactions(id, page, limit);
  }

  /**
   * Get security change request history for a specific user (Admin / Risk Officer)
   * GET /users/:id/security-changes?page=1&limit=20
   */
  @Get(':id/security-changes')
  @ApiOperation({
    summary: 'Get user security change history',
    description: 'Retrieve all security change requests (email/password) for a specific user',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.USERS_SECURITY_REVIEW)
  @ApiSuccessResponse('Security changes retrieved successfully')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getUserSecurityChanges(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.usersService.getUserSecurityChanges(id, page, limit);
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
  @RequireAdminOrSupport()
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
    description: "Update the authenticated user's profile information",
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
   * Register / clear FCM device token for push notifications
   * PATCH /users/me/fcm-token
   */
  @Patch('me/fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Register FCM device token',
    description: 'Save or clear the FCM token for push notifications on the current device',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { fcm_token: { type: 'string', nullable: true, example: 'dYour_FCM_token...' } },
    },
  })
  @ApiSuccessResponse('FCM token saved')
  @ApiUnauthorizedResponse('Unauthorized')
  async saveFcmToken(
    @CurrentUser('userId') userId: string,
    @Body('fcm_token') fcmToken: string | null,
  ) {
    await this.usersService.saveFcmToken(userId, fcmToken ?? null);
  }

  /**
   * Get orders for a specific user (Admin/Support/Risk only)
   * GET /users/:id/orders
   */
  @Get(':id/orders')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireAdminOrSupport()
  @RequirePermissions(Permission.USERS_READ)
  @ApiOperation({
    summary: 'Get user orders',
    description: 'Get order history for a specific user (Admin/Support/Risk only)',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'],
  })
  @ApiSuccessResponse('User orders retrieved successfully')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getUserOrders(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.usersService.getUserOrders(id, page, limit, status);
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
