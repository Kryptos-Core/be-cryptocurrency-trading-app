import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEncryptionService } from '@/common/services';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { TreasuryE2EConfig } from '@/entities/treasury-e2e-config.entity';
import { AuthModule } from '@/modules/auth/auth.module';
import { BlockchainModule } from '@/modules/blockchain/blockchain.module';
import { UsersModule } from '@/modules/users/users.module';
import { GetTreasuryE2EConfigsQuery } from './application/queries';
import {
  ActivateTreasuryE2EConfigUseCase,
  ArchiveTreasuryE2EConfigUseCase,
  CreateTreasuryE2EConfigUseCase,
  DeactivateTreasuryE2EConfigUseCase,
  UpdateTreasuryE2EConfigUseCase,
} from './application/use-cases';
import { TREASURY_E2E_CONFIG_REPOSITORY } from './domain/ports';
import { TreasuryE2EConfigRepository } from './repositories/treasury-e2e-config.repository';
import { TreasuryE2EConfigController } from './treasury-e2e-config.controller';
import { TreasuryE2EConfigService } from './treasury-e2e-config.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    forwardRef(() => BlockchainModule),
    TypeOrmModule.forFeature([TreasuryE2EConfig, IntegrationOutbox]),
  ],
  controllers: [TreasuryE2EConfigController],
  providers: [
    TreasuryE2EConfigRepository,
    {
      provide: TREASURY_E2E_CONFIG_REPOSITORY,
      useExisting: TreasuryE2EConfigRepository,
    },
    WalletEncryptionService,
    TreasuryE2EConfigService,
    GetTreasuryE2EConfigsQuery,
    CreateTreasuryE2EConfigUseCase,
    UpdateTreasuryE2EConfigUseCase,
    ActivateTreasuryE2EConfigUseCase,
    DeactivateTreasuryE2EConfigUseCase,
    ArchiveTreasuryE2EConfigUseCase,
  ],
  exports: [TreasuryE2EConfigService],
})
export class TreasuryE2EConfigModule {}
