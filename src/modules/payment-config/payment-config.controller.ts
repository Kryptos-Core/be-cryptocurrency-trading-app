import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RoleGuard } from '@/common/guards/role.guard';
import type {
  ActivatePaymentConfigDto,
  CreatePaymentConfigDto,
  UpdatePaymentConfigDto,
} from './dto';
import { PaymentConfigService } from './payment-config.service';

@Controller('payment-configs')
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
@RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
export class PaymentConfigController {
  constructor(private readonly service: PaymentConfigService) {}

  /** List all payment method configs (encrypted_config is excluded from response) */
  @Get()
  async list() {
    return this.service.listConfigs();
  }

  /** Types and networks for create/edit form (no secrets). */
  @Get('options')
  async formOptions() {
    return this.service.getFormOptions();
  }

  /** Single config for edit UI — includes decrypted `config` object (secrets). */
  @Get(':id')
  async getOne(@Param('id') configId: string) {
    return this.service.getConfigByIdForEdit(configId);
  }

  /** Create a new payment method config (starts as INACTIVE) */
  @Post()
  async create(@Body() dto: CreatePaymentConfigDto, @CurrentUser('userId') userId: string) {
    return this.service.createConfig(dto, userId);
  }

  /** Update display name, config values, grace period, or sort order */
  @Put(':id')
  async update(
    @Param('id') configId: string,
    @Body() dto: UpdatePaymentConfigDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.updateConfig(configId, dto, userId);
  }

  /**
   * Start grace-period activation flow:
   * - Sets status to TRANSITIONING
   * - Publishes TRANSITIONING event via WebSocket
   * - Schedules Bull job to complete activation after grace period
   */
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('id') configId: string,
    @Body() dto: ActivatePaymentConfigDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.activateWithGracePeriod(configId, dto, userId);
  }

  /** Immediately deactivate a config */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') configId: string, @CurrentUser('userId') userId: string) {
    await this.service.deactivateConfig(configId, userId);
    return { success: true };
  }
}
