import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GetExchangeModeQuery {
  constructor(private readonly config: ConfigService) {}

  execute(): { mode: string } {
    const mode = this.config.get<string>('app.trading.exchangeMode') ?? 'mock';
    return { mode };
  }
}
