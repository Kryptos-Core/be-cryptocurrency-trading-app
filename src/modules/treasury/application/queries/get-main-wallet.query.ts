import { Injectable } from '@nestjs/common';
import type { TreasuryMainWalletRecord } from '@/modules/treasury';
import {
  type SupportedTreasuryChain,
  TreasuryMainWalletService,
} from '../../treasury-main-wallet.service';

@Injectable()
export class GetMainWalletQuery {
  constructor(private readonly service: TreasuryMainWalletService) {}

  async listByChain(chain: string) {
    return this.service.listByChain(chain as SupportedTreasuryChain);
  }

  async listPendingApproval() {
    return this.service.listPendingApproval();
  }

  async getById(mainWalletId: string): Promise<TreasuryMainWalletRecord> {
    return this.service.getById(mainWalletId);
  }

  async getDefaultActiveMainWalletAddressOrNull(chain: string): Promise<string | null> {
    return this.service.getDefaultActiveMainWalletAddressOrNull(chain);
  }

  async getMainWalletAddress(
    chain: SupportedTreasuryChain,
    mainWalletId?: string,
  ): Promise<string> {
    return this.service.getMainWalletAddress(chain, mainWalletId);
  }

  async resolveMainWalletPrivateKey(chain: SupportedTreasuryChain): Promise<string> {
    return this.service.resolveMainWalletPrivateKey(chain);
  }

  async getWalletsDueForRotation(globalIntervalDays: number): Promise<TreasuryMainWalletRecord[]> {
    return this.service.getWalletsDueForRotation(globalIntervalDays);
  }
}
