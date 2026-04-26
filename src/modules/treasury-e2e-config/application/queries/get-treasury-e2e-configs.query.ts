import { Injectable } from '@nestjs/common';
import { TreasuryE2EConfigService } from '../../treasury-e2e-config.service';

@Injectable()
export class GetTreasuryE2EConfigsQuery {
  constructor(private readonly service: TreasuryE2EConfigService) {}

  async list() {
    return this.service.listConfigs();
  }

  async getConfigByIdForEdit(configId: string) {
    return this.service.getConfigByIdForEdit(configId);
  }
}
