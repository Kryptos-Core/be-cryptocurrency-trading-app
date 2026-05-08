import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RoleGuard } from '@/common/guards/role.guard';
import { ConfigCategory } from '@/entities/system-config.entity';
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

  private async _getRuntimeSettingsByCategory(category: ConfigCategory) {
    return this.getRuntimeSettings.execute(category);
  }

  private async _updateBulkByCategory(
    category: ConfigCategory,
    updates: Record<string, string>,
    userId?: string,
  ) {
    if (Object.keys(updates).length === 0) return { updated: [] };
    return this.updateConfigsBulk.execute(updates, userId);
  }

  // ── TECH ────────────────────────────────────────────────────────────────

  @Get('runtime/tech')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.SYSTEM_CONFIG_EDIT_TECH)
  @ApiOperation({ summary: 'Runtime settings — TECH category (RPC URLs, blockchain infra)' })
  async getRuntimeSettingsTechHandler() {
    return this._getRuntimeSettingsByCategory(ConfigCategory.TECH);
  }

  @Patch('runtime/tech')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.SYSTEM_CONFIG_EDIT_TECH)
  @ApiOperation({ summary: 'Bulk update TECH runtime settings' })
  async patchRuntimeSettingsTech(
    @Body() dto: UpdateRuntimeSettingsBulkDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this._updateBulkByCategory(ConfigCategory.TECH, dto.updates ?? {}, userId);
  }

  // ── FINANCE ─────────────────────────────────────────────────────────────

  @Get('runtime/finance')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.SYSTEM_CONFIG_EDIT_FINANCE)
  @ApiOperation({ summary: 'Runtime settings — FINANCE category (withdraw limits, rates, MM)' })
  async getRuntimeSettingsFinanceHandler() {
    return this._getRuntimeSettingsByCategory(ConfigCategory.FINANCE);
  }

  @Patch('runtime/finance')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.SYSTEM_CONFIG_EDIT_FINANCE)
  @ApiOperation({ summary: 'Bulk update FINANCE runtime settings' })
  async patchRuntimeSettingsFinance(
    @Body() dto: UpdateRuntimeSettingsBulkDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this._updateBulkByCategory(ConfigCategory.FINANCE, dto.updates ?? {}, userId);
  }

  // ── OPS ─────────────────────────────────────────────────────────────────

  @Get('runtime/ops')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.SYSTEM_CONFIG_EDIT_OPS)
  @ApiOperation({
    summary: 'Runtime settings — OPS category (matching, aggregator, outbox, rollout)',
  })
  async getRuntimeSettingsOpsHandler() {
    return this._getRuntimeSettingsByCategory(ConfigCategory.OPS);
  }

  @Patch('runtime/ops')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.SYSTEM_CONFIG_EDIT_OPS)
  @ApiOperation({ summary: 'Bulk update OPS runtime settings' })
  async patchRuntimeSettingsOps(
    @Body() dto: UpdateRuntimeSettingsBulkDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this._updateBulkByCategory(ConfigCategory.OPS, dto.updates ?? {}, userId);
  }

  // ── CORE ────────────────────────────────────────────────────────────────

  @Get('runtime/core')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.SYSTEM_CONFIG_EDIT_CORE)
  @ApiOperation({
    summary: 'Runtime settings — CORE category (symbols, market sources, wallet config)',
  })
  async getRuntimeSettingsCoreHandler() {
    return this._getRuntimeSettingsByCategory(ConfigCategory.CORE);
  }

  @Patch('runtime/core')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.SYSTEM_CONFIG_EDIT_CORE)
  @ApiOperation({ summary: 'Bulk update CORE runtime settings' })
  async patchRuntimeSettingsCore(
    @Body() dto: UpdateRuntimeSettingsBulkDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this._updateBulkByCategory(ConfigCategory.CORE, dto.updates ?? {}, userId);
  }

  // ── LEGACY (all categories — keep existing endpoint for backward compat) ─

  @Get('runtime')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Runtime platform settings (all categories, legacy)' })
  async getRuntimeSettingsHandler(@Query('category') category?: string) {
    const cat =
      category && Object.values(ConfigCategory).includes(category as ConfigCategory)
        ? (category as ConfigCategory)
        : undefined;
    return this.getRuntimeSettings.execute(cat);
  }

  @Patch('runtime')
  @RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
  @ApiOperation({ summary: 'Bulk update runtime platform settings (legacy — all categories)' })
  async patchRuntimeSettings(
    @Body() dto: UpdateRuntimeSettingsBulkDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.updateConfigsBulk.execute(dto.updates ?? {}, userId);
  }

  // ── DB ROWS ────────────────────────────────────────────────────────────

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
