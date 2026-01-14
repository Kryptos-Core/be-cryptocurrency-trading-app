import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto';
import { JwtAuthGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
} from '@/common/decorators';

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
  async getCurrentUser(@CurrentUser('userId') userId: number) {
    return this.usersService.findOne(userId);
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
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiSuccessResponse('User retrieved successfully')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async findOne(@Param('id', ParseIntPipe) id: number) {
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
    @CurrentUser('userId') userId: number,
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
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateUserDto })
  @ApiSuccessResponse('User updated successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
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
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiSuccessResponse('User deleted successfully')
  @ApiNotFoundResponse('User not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.usersService.remove(id);
    return { message: 'User deleted successfully' };
  }
}
