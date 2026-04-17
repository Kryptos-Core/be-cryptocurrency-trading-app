import { Injectable } from '@nestjs/common';

/** Read-side query for diagnostics / admin — identifies the active OHLCV provider implementation. */
@Injectable()
export class GetPriceOracleProviderIdQuery {
  execute(): { providerId: string } {
    return { providerId: 'binance-ohlcv' };
  }
}
