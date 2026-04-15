import type { EntityManager } from 'typeorm';
import type {
  PaymentMethodConfig,
  PaymentMethodStatus,
  PaymentMethodType,
} from '@/entities/payment-method-config.entity';

export interface PaymentConfigRepositoryPort {
  findActive(type: PaymentMethodType, network: string): Promise<PaymentMethodConfig | null>;
  findAll(): Promise<Omit<PaymentMethodConfig, 'encrypted_config'>[]>;
  findById(id: string | number): Promise<PaymentMethodConfig | null>;
  upsert(
    configId: string,
    type: PaymentMethodType,
    network: string,
    displayName: string,
    encryptedConfig: string,
    gracePeriodMinutes: number,
    sortOrder: number,
    userId: string,
  ): Promise<PaymentMethodConfig>;
  setStatus(
    configId: string,
    status: PaymentMethodStatus,
    userId: string,
    manager?: EntityManager,
  ): Promise<PaymentMethodConfig>;
  findTransitioningPastGrace(): Promise<
    Array<{ config_id: string; type: PaymentMethodType; network: string; updated_by: string }>
  >;
  countPendingTransactions(): Promise<number>;
}
