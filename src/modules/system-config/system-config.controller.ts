import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SystemConfigService } from './system-config.service';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { UpdateRuntimeSettingsBulkDto } from './dto/update-runtime-settings-bulk.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RoleGuard } from '@/common/guards/role.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole, Permission } from '@/common/enums';

@ApiTags('System Configs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@Controller('system-configs')
export class SystemConfigController {
  constructor(private readonly configService: SystemConfigService) {}

  @Get('runtime')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({
    summary: 'Runtime platform settings (effective values for admin UI)',
  })
  async getRuntimeSettings() {
    return this.configService.getRuntimeSettingsForAdmin();
  }

  @Patch('runtime')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Bulk update runtime platform settings' })
  async patchRuntimeSettings(
    @Body() dto: UpdateRuntimeSettingsBulkDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.configService.updateConfigsBulk(dto.updates ?? {}, userId);
  }

  @Get()
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'List all system config rows (DB)' })
  async getAllConfigs() {
    return this.configService.getAllConfigs();
  }

  @Patch(':key')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Update a single config key' })
  async updateConfig(
    @Param('key') key: string,
    @Body() dto: UpdateSystemConfigDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.configService.updateConfig(key, dto.value, userId);
  }
}
