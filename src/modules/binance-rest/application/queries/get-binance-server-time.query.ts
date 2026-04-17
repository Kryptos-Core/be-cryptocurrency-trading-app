import { Injectable } from '@nestjs/common';
import { BinanceRestClient } from '../../binance-rest-client.service';

@Injectable()
export class GetBinanceServerTimeQuery {
  constructor(private readonly client: BinanceRestClient) {}

  execute(): Promise<{ serverTime: number }> {
    return this.client.getPublicJson<{ serverTime: number }>('/api/v3/time');
  }
}
