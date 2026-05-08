import { Inject, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { TronWeb } from 'tronweb';
import { uuidv7 } from 'uuidv7';
import {
  BLOCKCHAIN_CHAIN_DB_VALUES,
  type BlockchainChainDbValue,
} from '@/common/constants/blockchain-chain-db';
import { listActionableOnchainChainCodes } from '@/common/constants/chain-registry';
import { BlockchainNetwork, UserRole } from '@/common/enums';
import {
  BadRequestException,
  BusinessException,
  ForbiddenException,
  NotFoundException,
} from '@/common/exceptions';
import { WalletEncryptionService } from '@/common/services';
import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import type { TransactionWalletRecord } from '@/modules/treasury';
import {
  TREASURY_TRANSACTION_WALLET_REPOSITORY,
  type TreasuryTransactionWalletRepositoryPort,
} from '@/modules/treasury/domain/ports';
import {
  EVM_DEPOSIT_UI_CHAINS,
  type EvmDepositUiChain,
  type TronDepositUiChain,
} from '@/modules/treasury/infrastructure/persistence/treasury-transaction-wallet.repository';
import { OnchainChainPickerService } from '@/modules/treasury/onchain-chain-picker.service';
import { resolveRecommendedChainForDepositPicker } from '@/modules/treasury/onchain-chain-picker.util';
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import {
  MANAGED_WALLETS_DATA_REPOSITORY,
  type ManagedWalletsDataRepositoryPort,
} from './domain/ports';
import type {
  CreateManagedWalletDto,
  ManagedWalletResponseDto,
  SendManagedTransactionDto,
  UpdateRecommendedChainDto,
} from './dto';

const MANAGED_TRON_CHAINS = [
  BlockchainNetwork.TRON_MAINNET,
  BlockchainNetwork.TRON_NILE,
  BlockchainNetwork.TRON_SHASTA,
] as const;

type SupportedManagedWalletChain = (typeof MANAGED_TRON_CHAINS)[number];

function isEvmDepositChain(chain: string): chain is EvmDepositUiChain {
  return (EVM_DEPOSIT_UI_CHAINS as readonly string[]).includes(chain);
}

type DepositMethodItem = {
  /** API chain code — same universe as GET /treasury/chain-picker-options `onchain_deposit_withdraw`. */
  chain: string;
  label: string;
  deposit_address: string;
  is_recommended: boolean;
  deposit_enabled: boolean;
  min_confirmations: number;
  estimated_time: string;
};

type DepositMethodBaseItem = Omit<DepositMethodItem, 'is_recommended'>;

@Injectable()
export class ManagedWalletsService {
  private readonly logger = new Logger(ManagedWalletsService.name);
  private static readonly RECOMMENDED_CHAIN_KEY = 'deposit.recommended_chain';

  constructor(
    @Inject(MANAGED_WALLETS_DATA_REPOSITORY)
    private readonly managedWalletsDataRepository: ManagedWalletsDataRepositoryPort,
    @Inject(TREASURY_TRANSACTION_WALLET_REPOSITORY)
    private readonly treasuryTransactionWalletRepository: TreasuryTransactionWalletRepositoryPort,
    private readonly walletEncryptionService: WalletEncryptionService,
    private readonly transactionWalletService: TransactionWalletService,
    private readonly systemConfigService: SystemConfigService,
    private readonly onchainChainPickerService: OnchainChainPickerService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
  ) {}

  async createWallet(
    _userId: string,
    _dto: CreateManagedWalletDto,
  ): Promise<ManagedWalletResponseDto> {
    throw new ForbiddenException(
      'Managed wallet creation is disabled. Create a transaction wallet via POST /treasury/wallets (purpose DEPOSIT or BOTH).',
    );
  }

  async listWallets(_userId: string, _role: UserRole): Promise<ManagedWalletResponseDto[]> {
    const wallets = await this.transactionWalletService.listWalletsForDepositConfiguration();
    return wallets.map((wallet) => this.mapTransactionWallet(wallet));
  }

  async getDepositDefaults(): Promise<{
    recommended_chain: BlockchainChainDbValue;
    defaults: ManagedWalletResponseDto[];
  }> {
    const pickerDto = this.onchainChainPickerService.getChainPickerOptions();
    const chains = (pickerDto.pickers.managed_wallets ?? []).filter(
      (c): c is BlockchainChainDbValue =>
        (BLOCKCHAIN_CHAIN_DB_VALUES as readonly string[]).includes(c),
    );
    const recommendedChain = await this.getRecommendedChain();
    const defaults: ManagedWalletResponseDto[] = [];

    for (const chain of chains) {
      const tw = await this.transactionWalletService.getDefaultUserDepositWallet(chain);
      if (tw) {
        defaults.push(this.mapTransactionWallet(tw));
      }
    }

    return {
      recommended_chain: recommendedChain,
      defaults,
    };
  }

  async getWalletDetail(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<ManagedWalletResponseDto & { balance: string; symbol: string }> {
    await this.requireTransactionWalletForActor(userId, walletId, role);
    const detail = await this.transactionWalletService.getWalletDetail(walletId);
    return {
      ...this.mapTransactionWallet(detail),
      balance: detail.balance,
      symbol: detail.symbol,
    };
  }

  async getWalletTransactions(
    userId: string,
    walletId: string,
    role: UserRole,
    limit: number = 50,
  ): Promise<BlockchainOnchainTransactionRecord[]> {
    const wallet = await this.requireTransactionWalletForActor(userId, walletId, role);
    const { chain, address } = wallet;

    return this.managedWalletsDataRepository.listOnchainTransactionsForAddress(
      chain,
      address,
      Math.max(1, Math.min(limit, 200)),
    );
  }

  async sendTransaction(
    userId: string,
    walletId: string,
    role: UserRole,
    dto: SendManagedTransactionDto,
  ): Promise<{
    txId: string;
    txHash: string;
    chain: SupportedManagedWalletChain;
    fromAddress: string;
    toAddress: string;
    amount: string;
    memo?: string;
  }> {
    const w = await this.requireTransactionWalletForActor(userId, walletId, role);
    const amount = this.normalizePositiveAmount(dto.amount);

    if (!(MANAGED_TRON_CHAINS as readonly string[]).includes(w.chain)) {
      throw new BadRequestException(
        'Only Tron family transaction wallets support this send endpoint',
        'UNSUPPORTED_SEND_CHAIN',
      );
    }
    const chain = this.assertSupportedChain(w.chain);
    const tronWeb = await this.buildTronWeb(
      chain,
      this.walletEncryptionService.decrypt(w.encrypted_private_key),
    );

    if (!tronWeb.isAddress(dto.to_address)) {
      throw new BadRequestException('Invalid Tron destination address', 'INVALID_TRON_ADDRESS');
    }

    const tx = await tronWeb.trx.sendTransaction(
      dto.to_address,
      Math.floor(Number(new Decimal(amount).mul(1_000_000).toString())),
    );

    if (!tx?.result || !tx?.txid) {
      throw new BusinessException('Failed to submit Tron transaction', 'TRON_SEND_FAILED');
    }

    const txId = uuidv7();
    await this.managedWalletsDataRepository.saveOnchainTransaction({
      tx_id: txId,
      user_id: userId,
      linked_wallet_id: null,
      chain,
      type: 'TRANSFER',
      tx_hash: tx.txid,
      from_address: w.address,
      to_address: dto.to_address,
      amount,
      confirmations: 0,
      status: 'PENDING',
      confirmed_at: null,
    });

    this.logger.log(
      `Transaction wallet transfer submitted: wallet=${walletId}, txHash=${tx.txid}, amount=${amount}`,
    );

    return {
      txId,
      txHash: tx.txid,
      chain,
      fromAddress: w.address,
      toAddress: dto.to_address,
      amount,
      memo: dto.memo,
    };
  }

  async setDepositDefault(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<ManagedWalletResponseDto> {
    await this.requireTransactionWalletForActor(userId, walletId, role);
    await this.transactionWalletService.setDefaultUserDeposit(walletId);
    const updated = await this.treasuryTransactionWalletRepository.findByWalletId(walletId);
    if (!updated) {
      throw new NotFoundException('Transaction wallet', walletId);
    }
    return this.mapTransactionWallet(updated);
  }

  async clearDepositDefault(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<ManagedWalletResponseDto> {
    await this.requireTransactionWalletForActor(userId, walletId, role);
    const updated = await this.transactionWalletService.unsetDefaultUserDeposit(walletId);
    return this.mapTransactionWallet(updated);
  }

  async setRecommendedChain(
    dto: UpdateRecommendedChainDto,
  ): Promise<{ recommended_chain: BlockchainChainDbValue }> {
    const chain = this.assertRecommendedChainAllowed(dto.chain);
    await this.managedWalletsDataRepository.upsertAppSettingKeyValue(
      ManagedWalletsService.RECOMMENDED_CHAIN_KEY,
      chain,
    );

    return { recommended_chain: chain };
  }

  async deactivateWallet(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<{ success: true }> {
    await this.requireTransactionWalletForActor(userId, walletId, role);
    await this.transactionWalletService.deactivateWallet(walletId);
    return { success: true };
  }

  /**
   * Public deposit recipient for a chain — **same** string as each row in `GET /deposit/methods`
   * (`resolveDepositMethodDisplayAddress`). Use for `GET /blockchain/deposit/address` so QR / copy
   * in the deposit form matches the expandable “Phương thức nạp tiền” card (mainnet vs testnet from ops config).
   */
  async getPublicDepositRecipientAddress(chain: string): Promise<string> {
    return this.resolveDepositMethodDisplayAddress(chain);
  }

  /**
   * Public deposit methods — operational wallets (ví vận hành) only.
   *
   * Returns deposit addresses that have been set by operators as defaults:
   * - Only operational transaction wallets with purpose DEPOSIT|BOTH
   * - Only TRON mainnet, TRON Nile, and TRON Shasta supported
   * - Non-TRON chains NOT returned (no master wallet fallback)
   * - Methods with empty addresses are filtered out
   *
   * Recommended chain indicator shows which method to highlight in UI.
   */
  async getDepositMethods(): Promise<{
    /** Effective recommended row for public deposit UI — always a chain from `onchain_deposit_withdraw`. */
    recommended_chain: string;
    methods: DepositMethodItem[];
  }> {
    const pickerDto = this.onchainChainPickerService.getChainPickerOptions();
    const pickerList = pickerDto.pickers.onchain_deposit_withdraw ?? [];
    const fromPicker = pickerList.filter((c): c is BlockchainChainDbValue =>
      (BLOCKCHAIN_CHAIN_DB_VALUES as readonly string[]).includes(c),
    );
    const fallback = listActionableOnchainChainCodes(
      pickerDto.operatorMode === 'production',
      pickerDto.tronDefaultNetwork,
    ).filter((c): c is BlockchainChainDbValue =>
      (BLOCKCHAIN_CHAIN_DB_VALUES as readonly string[]).includes(c),
    );
    const chains: string[] = fromPicker.length > 0 ? fromPicker : fallback;

    const networkMap =
      await this.managedWalletsDataRepository.aggregateDepositFlagsByNetworkCodes(chains);

    const rawMethods = await Promise.all<DepositMethodBaseItem | null>(
      chains.map(async (chain) => {
        const address = await this.resolveDepositMethodDisplayAddress(chain);
        if (!address.trim()) {
          return null;
        }
        const networkConfig = networkMap.get(chain);
        const hasDefault = address.length > 0;
        return {
          chain,
          label: ManagedWalletsService.depositLabelForChain(chain),
          deposit_address: address,
          deposit_enabled: (networkConfig?.deposit_enabled ?? true) && hasDefault,
          min_confirmations: networkConfig?.min_confirmations ?? 12,
          estimated_time: '~3 minutes',
        } satisfies DepositMethodBaseItem;
      }),
    );

    const configuredMethods = rawMethods.filter(
      (method): method is DepositMethodBaseItem => method !== null,
    );
    const configuredChains = configuredMethods.map((method) => method.chain);
    const settingRecommended = await this.getRecommendedChain();
    const recommendedChain = resolveRecommendedChainForDepositPicker(
      settingRecommended,
      configuredChains.length > 0 ? configuredChains : chains,
      pickerDto.tronDefaultNetwork,
    );
    const methods = configuredMethods.map((method) => ({
      ...method,
      is_recommended: method.chain === recommendedChain,
    }));

    return {
      recommended_chain: recommendedChain,
      methods: methods.sort((a, b) => Number(b.is_recommended) - Number(a.is_recommended)),
    };
  }

  async getRecommendedChain(): Promise<BlockchainChainDbValue> {
    const v = await this.managedWalletsDataRepository.findAppSettingValueByKey(
      ManagedWalletsService.RECOMMENDED_CHAIN_KEY,
    );
    const pickerDto = this.onchainChainPickerService.getChainPickerOptions();
    const allowed = (pickerDto.pickers.managed_wallets ?? []).filter(
      (c): c is BlockchainChainDbValue =>
        (BLOCKCHAIN_CHAIN_DB_VALUES as readonly string[]).includes(c),
    );
    const raw = (v?.trim() || BlockchainNetwork.TRON_MAINNET) as string;
    if (!(BLOCKCHAIN_CHAIN_DB_VALUES as readonly string[]).includes(raw)) {
      return resolveRecommendedChainForDepositPicker(
        BlockchainNetwork.TRON_MAINNET,
        allowed,
        pickerDto.tronDefaultNetwork,
      ) as BlockchainChainDbValue;
    }
    return resolveRecommendedChainForDepositPicker(
      raw,
      allowed,
      pickerDto.tronDefaultNetwork,
    ) as BlockchainChainDbValue;
  }

  private async requireTransactionWalletForActor(
    _userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<TransactionWalletRecord> {
    if (
      role !== UserRole.ADMIN &&
      role !== UserRole.RISK_OFFICER &&
      role !== UserRole.FINANCE_MANAGER
    ) {
      throw new ForbiddenException('Not allowed to access transaction wallets');
    }
    const wallet = await this.treasuryTransactionWalletRepository.findByWalletId(walletId);
    if (!wallet) {
      throw new NotFoundException('Transaction wallet', walletId);
    }
    return wallet;
  }

  private mapTransactionWallet(wallet: TransactionWalletRecord): ManagedWalletResponseDto {
    return {
      walletId: wallet.wallet_id,
      userId: '',
      chain: wallet.chain,
      address: wallet.address,
      publicKey: '',
      label: wallet.label,
      isDefaultDeposit: wallet.is_default_user_deposit,
      isActive: wallet.is_active,
      defaultSetAt: wallet.default_set_at ? wallet.default_set_at.toISOString() : null,
      createdAt: wallet.created_at.toISOString(),
      updatedAt: wallet.updated_at.toISOString(),
    };
  }

  /**
   * Operational wallet (ví vận hành) set by operators as default deposit address only.
   * Transaction wallets with purpose DEPOSIT|BOTH are returned.
   *
   * Tron networks: default user-deposit transaction wallet only.
   * EVM networks: default user-deposit transaction wallet only.
   * Other chains: NOT supported — no fallback to treasury main wallets.
   */
  private async resolveDepositMethodDisplayAddress(chain: string): Promise<string> {
    const c = chain as BlockchainNetwork;

    // Tron networks
    if (c === BlockchainNetwork.TRON_MAINNET) {
      const tw = await this.transactionWalletService.getDefaultUserDepositWallet(
        BlockchainNetwork.TRON_MAINNET,
      );
      return tw?.address ?? '';
    }
    if (c === BlockchainNetwork.TRON_NILE || c === BlockchainNetwork.TRON_SHASTA) {
      const tw = await this.transactionWalletService.getDefaultUserDepositWallet(
        c as TronDepositUiChain,
      );
      return tw?.address ?? '';
    }

    // EVM networks — use same transaction wallet pattern
    if (isEvmDepositChain(c)) {
      const tw = await this.transactionWalletService.getDefaultUserDepositWallet(
        c as unknown as BlockchainChainDbValue,
      );
      return tw?.address ?? '';
    }

    // Other chains: operational wallet defaults not supported
    return '';
  }

  private static depositLabelForChain(chain: string): string {
    switch (chain) {
      case BlockchainNetwork.TRON_NILE:
        return 'Tron Nile (TRC-20 testnet)';
      case BlockchainNetwork.TRON_SHASTA:
        return 'Tron Shasta (TRC-20 testnet)';
      case BlockchainNetwork.TRON_MAINNET:
        return 'Tron Network (TRC-20 Mainnet)';
      case BlockchainNetwork.ETH_MAINNET:
        return 'Ethereum (mainnet)';
      case BlockchainNetwork.ETH_SEPOLIA:
        return 'Ethereum — Sepolia (testnet)';
      case BlockchainNetwork.BSC_CHAPEL:
        return 'BNB Smart Chain (Chapel testnet)';
      case BlockchainNetwork.BSC_MAINNET:
        return 'BNB Smart Chain (mainnet)';
      case BlockchainNetwork.SOLANA_DEVNET:
        return 'Solana (devnet)';
      case BlockchainNetwork.SOLANA_MAINNET:
        return 'Solana (mainnet)';
      case BlockchainNetwork.BASE_MAINNET:
        return 'Base — Mainnet';
      case BlockchainNetwork.BASE_SEPOLIA:
        return 'Base — Sepolia (testnet)';
      case BlockchainNetwork.ARBITRUM_MAINNET:
        return 'Arbitrum — Mainnet';
      case BlockchainNetwork.ARBITRUM_SEPOLIA:
        return 'Arbitrum — Sepolia (testnet)';
      case BlockchainNetwork.OPTIMISM_MAINNET:
        return 'Optimism — Mainnet';
      case BlockchainNetwork.OPTIMISM_SEPOLIA:
        return 'Optimism — Sepolia (testnet)';
      case BlockchainNetwork.POLYGON_MAINNET:
        return 'Polygon — Mainnet';
      case BlockchainNetwork.POLYGON_AMOY:
        return 'Polygon — Amoy (testnet)';
      case BlockchainNetwork.AVALANCHE_MAINNET:
        return 'Avalanche — Mainnet';
      case BlockchainNetwork.AVALANCHE_FUJI:
        return 'Avalanche — Fuji (testnet)';
      case BlockchainNetwork.GNOSIS_MAINNET:
        return 'Gnosis — Mainnet';
      case BlockchainNetwork.GNOSIS_CHIADO:
        return 'Gnosis — Chiado (testnet)';
      case BlockchainNetwork.LINEA_MAINNET:
        return 'Linea — Mainnet';
      case BlockchainNetwork.LINEA_SEPOLIA:
        return 'Linea — Sepolia (testnet)';
      case BlockchainNetwork.FANTOM_MAINNET:
        return 'Fantom — Mainnet';
      case BlockchainNetwork.FANTOM_TESTNET:
        return 'Fantom — Testnet';
      case BlockchainNetwork.TON_MAINNET:
        return 'TON — Mainnet';
      case BlockchainNetwork.TON_TESTNET:
        return 'TON — Testnet';
      default:
        return chain;
    }
  }

  private async buildTronWeb(
    chain: SupportedManagedWalletChain,
    privateKey?: string,
  ): Promise<TronWeb> {
    let fullHost: string;
    if (chain === BlockchainNetwork.TRON_NILE) {
      const v = await this.systemConfigService.get<string>('TRON_NILE_FULL_HOST');
      fullHost = v?.trim() || process.env.TRON_NILE_FULL_HOST?.trim() || 'https://nile.trongrid.io';
    } else if (chain === BlockchainNetwork.TRON_SHASTA) {
      const v = await this.systemConfigService.get<string>('TRON_SHASTA_FULL_HOST');
      fullHost =
        v?.trim() || process.env.TRON_SHASTA_FULL_HOST?.trim() || 'https://api.shasta.trongrid.io';
    } else {
      fullHost = await this.systemConfigService.getEffectiveString('TRON_MAINNET_FULL_HOST');
    }
    return new TronWeb({
      fullHost,
      privateKey: privateKey || undefined,
    });
  }

  private normalizePositiveAmount(rawAmount: string): string {
    let amount: Decimal;
    try {
      amount = new Decimal(rawAmount);
    } catch {
      throw new BadRequestException('Amount must be a valid decimal', 'INVALID_AMOUNT');
    }

    if (!amount.isFinite() || amount.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero', 'INVALID_AMOUNT');
    }

    return amount.toString();
  }

  private assertRecommendedChainAllowed(chain: string): BlockchainChainDbValue {
    if (!(BLOCKCHAIN_CHAIN_DB_VALUES as readonly string[]).includes(chain)) {
      throw new BadRequestException(
        `Unsupported chain code: ${chain}`,
        'UNSUPPORTED_MANAGED_WALLET_CHAIN',
      );
    }
    const pickerDto = this.onchainChainPickerService.getChainPickerOptions();
    const allowed = pickerDto.pickers.managed_wallets ?? [];
    if (!allowed.includes(chain)) {
      throw new BadRequestException(
        `Chain ${chain} is not enabled for the current on-chain operator mode`,
        'RECOMMENDED_CHAIN_NOT_IN_PICKER',
      );
    }
    return chain as BlockchainChainDbValue;
  }

  /** Tron-only send path — unchanged. */
  private assertSupportedChain(chain: string): SupportedManagedWalletChain {
    if (!(MANAGED_TRON_CHAINS as readonly string[]).includes(chain)) {
      throw new BadRequestException(
        `Unsupported managed wallet chain: ${chain}`,
        'UNSUPPORTED_MANAGED_WALLET_CHAIN',
      );
    }

    return chain as SupportedManagedWalletChain;
  }
}
