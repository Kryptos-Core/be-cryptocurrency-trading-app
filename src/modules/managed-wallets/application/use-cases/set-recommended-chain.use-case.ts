import { Injectable } from '@nestjs/common';
import type { UpdateRecommendedChainDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

/**
 * SetRecommendedChainUseCase — sets the recommended deposit chain shown to users.
 *
 * Thin adapter that delegates to ManagedWalletsService.setRecommendedChain.
 */
@Injectable()
export class SetRecommendedChainUseCase {
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(dto: UpdateRecommendedChainDto) {
    return this.managedWalletsService.setRecommendedChain(dto);
  }
}
