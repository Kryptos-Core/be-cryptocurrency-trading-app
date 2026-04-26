import { Injectable } from '@nestjs/common';
import type { CreateTreasuryE2EConfigDto } from '../../dto';
import { TreasuryE2EConfigService } from '../../treasury-e2e-config.service';

@Injectable()
export class CreateTreasuryE2EConfigUseCase {
  constructor(private readonly service: TreasuryE2EConfigService) {}

  async execute(dto: CreateTreasuryE2EConfigDto, userId: string) {
    return this.service.createConfig(dto, userId);
  }
}
