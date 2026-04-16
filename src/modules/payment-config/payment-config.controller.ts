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
import { GetPaymentConfigsQuery } from './application/queries/get-payment-configs.query';
import { ActivatePaymentConfigUseCase } from './application/use-cases/activate-payment-config.use-case';
import { CreatePaymentConfigUseCase } from './application/use-cases/create-payment-config.use-case';
import { DeactivatePaymentConfigUseCase } from './application/use-cases/deactivate-payment-config.use-case';
import { UpdatePaymentConfigUseCase } from './application/use-cases/update-payment-config.use-case';
import type {
  ActivatePaymentConfigDto,
  CreatePaymentConfigDto,
  UpdatePaymentConfigDto,
} from './dto';

@Controller('payment-configs')
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
@RequirePermissions(Permission.PAYMENT_CONFIGS_MANAGE)
export class PaymentConfigController {
  constructor(
    private readonly getPaymentConfigsQuery: GetPaymentConfigsQuery,
    private readonly createPaymentConfigUseCase: CreatePaymentConfigUseCase,
    private readonly updatePaymentConfigUseCase: UpdatePaymentConfigUseCase,
    private readonly activatePaymentConfigUseCase: ActivatePaymentConfigUseCase,
    private readonly deactivatePaymentConfigUseCase: DeactivatePaymentConfigUseCase,
  ) {}

  /** List all payment method configs (encrypted_config is excluded from response) */
  @Get()
  async list() {
    return this.getPaymentConfigsQuery.list();
  }

  /** Types and networks for create/edit form (no secrets). */
  @Get('options')
  async formOptions() {
    return this.getPaymentConfigsQuery.getFormOptions();
  }

  /** Single config for edit UI — includes decrypted `config` object (secrets). */
  @Get(':id')
  async getOne(@Param('id') configId: string) {
    return this.getPaymentConfigsQuery.getConfigByIdForEdit(configId);
  }

  /** Create a new payment method config (starts as INACTIVE) */
  @Post()
  async create(@Body() dto: CreatePaymentConfigDto, @CurrentUser('userId') userId: string) {
    return this.createPaymentConfigUseCase.execute(dto, userId);
  }

  /** Update display name, config values, grace period, or sort order */
  @Put(':id')
  async update(
    @Param('id') configId: string,
    @Body() dto: UpdatePaymentConfigDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.updatePaymentConfigUseCase.execute(configId, dto, userId);
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
    return this.activatePaymentConfigUseCase.execute(configId, dto, userId);
  }

  /** Immediately deactivate a config */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') configId: string, @CurrentUser('userId') userId: string) {
    return this.deactivatePaymentConfigUseCase.execute(configId, userId);
  }
}
