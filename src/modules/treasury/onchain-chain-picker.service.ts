import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { buildChainPickerOptions, type ChainPickerOptionsDto } from './onchain-chain-picker.util';

@Injectable()
export class OnchainChainPickerService {
  constructor(private readonly config: ConfigService) {}

  getChainPickerOptions(): ChainPickerOptionsDto {
    return buildChainPickerOptions({
      onchainOperatorMode: this.config.get<string>('ONCHAIN_OPERATOR_MODE'),
      // Flutter uses `ENV`; Nest often only has NODE_ENV — treat both as deployment hint.
      env: this.config.get<string>('ENV') ?? this.config.get<string>('NODE_ENV'),
      tronDefaultNetwork: this.config.get<string>('TRON_DEFAULT_NETWORK'),
    });
  }
}
