import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import { UserRole } from '@/common/enums';
import type { SendManagedTransactionDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

export class SendManagedWalletTransactionCommand extends BaseCommand {
  constructor(
    public readonly walletId: string,
    public readonly userId: string,
    public readonly role: UserRole,
    public readonly dto: SendManagedTransactionDto,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

/**
 * SendManagedWalletTransactionUseCase — sends TRX from a managed wallet.
 *
 * Thin adapter that delegates to ManagedWalletsService.sendTransaction.
 */
@Injectable()
export class SendManagedWalletTransactionUseCase
  implements ICommandHandler<SendManagedWalletTransactionCommand, Awaited<ReturnType<ManagedWalletsService['sendTransaction']>>>
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(command: SendManagedWalletTransactionCommand) {
    return this.managedWalletsService.sendTransaction(
      command.userId,
      command.walletId,
      command.role,
      command.dto,
    );
  }
}
