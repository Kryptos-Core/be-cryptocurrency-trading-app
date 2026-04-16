import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RoleGuard } from '@/common/guards/role.guard';
import { GetAllConfigsQuery, GetRuntimeSettingsQuery } from './application/queries';
import { UpdateConfigsBulkUseCase, UpdateConfigUseCase } from './application/use-cases';
import type { UpdateRuntimeSettingsBulkDto } from './dto/update-runtime-settings-bulk.dto';
import type { UpdateSystemConfigDto } from './dto/update-system-config.dto';

@ApiTags('System Configs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@Controller('system-configs')
export class SystemConfigController {
  constructor(
    private readonly getRuntimeSettings: GetRuntimeSettingsQuery,
    private readonly getAllConfigs: GetAllConfigsQuery,
    private readonly updateConfig: UpdateConfigUseCase,
    private readonly updateConfigsBulk: UpdateConfigsBulkUseCase,
  ) {}

  @Get('runtime')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({
    summary: 'Runtime platform settings (effective values for admin UI)',
  })
  async getRuntimeSettingsHandler() {
    return this.getRuntimeSettings.execute();
  }

  @Patch('runtime')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Bulk update runtime platform settings' })
  async patchRuntimeSettings(
    @Body() dto: UpdateRuntimeSettingsBulkDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.updateConfigsBulk.execute(dto.updates ?? {}, userId);
  }

  @Get()
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'List all system config rows (DB)' })
  async getAllConfigsHandler() {
    return this.getAllConfigs.execute();
  }

  @Patch(':key')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Update a single config key' })
  async updateConfigHandler(
    @Param('key') key: string,
    @Body() dto: UpdateSystemConfigDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.updateConfig.execute(key, dto.value, userId);
  }
}
