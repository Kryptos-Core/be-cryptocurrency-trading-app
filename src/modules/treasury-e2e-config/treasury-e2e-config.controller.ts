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
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RoleGuard } from '@/common/guards/role.guard';
import { GetTreasuryE2EConfigsQuery } from './application/queries';
import {
  ActivateTreasuryE2EConfigUseCase,
  ArchiveTreasuryE2EConfigUseCase,
  CreateTreasuryE2EConfigUseCase,
  DeactivateTreasuryE2EConfigUseCase,
  UpdateTreasuryE2EConfigUseCase,
} from './application/use-cases';
import type { CreateTreasuryE2EConfigDto, UpdateTreasuryE2EConfigDto } from './dto';
import { TreasuryE2EConfigService } from './treasury-e2e-config.service';

@Controller('treasury/e2e-configs')
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
@RequirePermissions(Permission.TREASURY_E2E_CONFIGS_MANAGE)
export class TreasuryE2EConfigController {
  constructor(
    private readonly getConfigsQuery: GetTreasuryE2EConfigsQuery,
    private readonly createUseCase: CreateTreasuryE2EConfigUseCase,
    private readonly updateUseCase: UpdateTreasuryE2EConfigUseCase,
    private readonly activateUseCase: ActivateTreasuryE2EConfigUseCase,
    private readonly deactivateUseCase: DeactivateTreasuryE2EConfigUseCase,
    private readonly archiveUseCase: ArchiveTreasuryE2EConfigUseCase,
    private readonly service: TreasuryE2EConfigService,
  ) {}

  @Get()
  async list() {
    return this.getConfigsQuery.list();
  }

  @Get('options')
  async options(
    @Query('environment') environment?: string,
    @Query('chain') chain?: string,
    @Query('traderUserId') traderUserId?: string,
    @Query('traderSearch') traderSearch?: string,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.service.getFormOptions({
      environment: environment?.trim() || undefined,
      chain: chain?.trim() || undefined,
      actorUserId: userId,
      traderUserId: traderUserId?.trim() || undefined,
      traderSearch: traderSearch?.trim() || undefined,
    });
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateConfig(@Body() dto: CreateTreasuryE2EConfigDto) {
    return this.service.validateConfigDraft(dto);
  }

  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  async testConnection(@Body() dto: CreateTreasuryE2EConfigDto) {
    return this.service.testConnectionDraft(dto);
  }

  @Get(':id')
  async getOne(@Param('id') configId: string) {
    return this.getConfigsQuery.getConfigByIdForEdit(configId);
  }

  @Post()
  async create(@Body() dto: CreateTreasuryE2EConfigDto, @CurrentUser('userId') userId: string) {
    return this.createUseCase.execute(dto, userId);
  }

  @Put(':id')
  async update(
    @Param('id') configId: string,
    @Body() dto: UpdateTreasuryE2EConfigDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.updateUseCase.execute(configId, dto, userId);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') configId: string, @CurrentUser('userId') userId: string) {
    return this.activateUseCase.execute(configId, userId);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') configId: string, @CurrentUser('userId') userId: string) {
    return this.deactivateUseCase.execute(configId, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id') configId: string, @CurrentUser('userId') userId: string) {
    return this.archiveUseCase.execute(configId, userId);
  }
}
