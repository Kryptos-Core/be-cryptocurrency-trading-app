import { Injectable } from '@nestjs/common';
import { TreasuryE2EConfigService } from '../../treasury-e2e-config.service';

@Injectable()
export class ActivateTreasuryE2EConfigUseCase {
  constructor(private readonly service: TreasuryE2EConfigService) {}

  async execute(configId: string, userId: string) {
    return this.service.activateConfig(configId, userId);
  }
}
