import { Injectable } from '@nestjs/common';
import type { CreateManagedWalletDto, ManagedWalletResponseDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

/**
 * CreateManagedWalletUseCase — creates a new managed wallet.
 *
 * Note: The underlying service always throws ForbiddenException.
 * This use-case exists for Clean Architecture compliance.
 */
@Injectable()
export class CreateManagedWalletUseCase {
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(userId: string, dto: CreateManagedWalletDto): Promise<ManagedWalletResponseDto> {
    return this.managedWalletsService.createWallet(userId, dto);
  }
}
