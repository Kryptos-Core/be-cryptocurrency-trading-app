import { Module } from '@nestjs/common';
import { UserBinanceCredentialsModule } from '@/modules/user-binance-credentials/user-binance-credentials.module';
import { BinanceProxyController } from './binance-proxy.controller';
import { BinanceProxyService } from './binance-proxy.service';

@Module({
  imports: [UserBinanceCredentialsModule],
  controllers: [BinanceProxyController],
  providers: [BinanceProxyService],
  exports: [BinanceProxyService],
})
export class BinanceProxyModule {}
