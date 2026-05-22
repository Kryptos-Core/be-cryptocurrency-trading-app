import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBinanceCredentials } from '@/entities/user-binance-credentials.entity';
import { BinanceCredentialsEncryptionService } from './infrastructure/binance-credentials-encryption.service';
import { UserBinanceCredentialsRepository } from './infrastructure/user-binance-credentials.repository';
import { UserBinanceCredentialsService } from './user-binance-credentials.service';
import { UserBinanceCredentialsController } from './user-binance-credentials.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserBinanceCredentials])],
  controllers: [UserBinanceCredentialsController],
  providers: [
    BinanceCredentialsEncryptionService,
    UserBinanceCredentialsRepository,
    UserBinanceCredentialsService,
  ],
  exports: [UserBinanceCredentialsService],
})
export class UserBinanceCredentialsModule {}
