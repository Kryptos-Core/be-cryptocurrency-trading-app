import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfig } from '@/entities/system-config.entity';
import { GetAllConfigsQuery, GetRuntimeSettingsQuery } from './application/queries';
import { UpdateConfigsBulkUseCase, UpdateConfigUseCase } from './application/use-cases';
import { SYSTEM_CONFIG_REPOSITORY } from './domain/ports';
import { SystemConfigRepositoryImpl } from './infrastructure/persistence';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigService } from './system-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig])],
  controllers: [SystemConfigController],
  providers: [
    // Infrastructure
    {
      provide: SYSTEM_CONFIG_REPOSITORY,
      useClass: SystemConfigRepositoryImpl,
    },

    // Application service (lifecycle + cache reads used by other modules)
    SystemConfigService,

    // Application use-cases
    UpdateConfigUseCase,
    UpdateConfigsBulkUseCase,

    // Application queries
    GetAllConfigsQuery,
    GetRuntimeSettingsQuery,
  ],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
