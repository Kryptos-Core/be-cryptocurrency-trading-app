import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceRestClient } from './binance-rest-client.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [BinanceRestClient],
  exports: [BinanceRestClient],
})
export class BinanceRestModule {}
