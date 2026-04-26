import { Injectable } from '@nestjs/common';
import type { UpdateTreasuryE2EConfigDto } from '../../dto';
import { TreasuryE2EConfigService } from '../../treasury-e2e-config.service';

@Injectable()
export class UpdateTreasuryE2EConfigUseCase {
  constructor(private readonly service: TreasuryE2EConfigService) {}

  async execute(configId: string, dto: UpdateTreasuryE2EConfigDto, userId: string) {
    return this.service.updateConfig(configId, dto, userId);
  }
}
