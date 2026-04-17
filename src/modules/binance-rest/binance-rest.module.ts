import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GetBinanceServerTimeQuery } from './application/queries/get-binance-server-time.query';
import { BinanceRestClient } from './binance-rest-client.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [BinanceRestClient, GetBinanceServerTimeQuery],
  exports: [BinanceRestClient, GetBinanceServerTimeQuery],
})
export class BinanceRestModule {}
