import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfig } from '@/entities/system-config.entity';
import { SYSTEM_CONFIG_REPOSITORY } from './domain/ports';
import { SystemConfigRepositoryImpl } from './infrastructure/persistence';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigService } from './system-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig])],
  controllers: [SystemConfigController],
  providers: [
    {
      provide: SYSTEM_CONFIG_REPOSITORY,
      useClass: SystemConfigRepositoryImpl,
    },
    SystemConfigService,
  ],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
