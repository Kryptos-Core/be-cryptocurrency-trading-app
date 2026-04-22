import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TreasuryWalletBusyException } from '@/common/exceptions';
import { RedisService } from '@/common/services';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { TREASURY_QUEUE } from './constants';
import {
  TREASURY_ONCHAIN_READ_REPOSITORY,
  TREASURY_OPERATION_REPOSITORY,
  type TreasuryOperationRepositoryPort,
} from './domain/ports';
import { TransactionWalletService } from './transaction-wallet.service';
import { TreasuryMainWalletService } from './treasury-main-wallet.service';
import { TreasuryOperationsService } from './treasury-operations.service';

describe('TreasuryOperationsService wallet lock', () => {
  let svc: TreasuryOperationsService;
  let redisSet: jest.Mock;

  beforeEach(async () => {
    redisSet = jest.fn().mockImplementation((key: string) => {
      if (key.startsWith('treasury:lock:')) {
        return Promise.resolve(null);
      }
      if (key.startsWith('treasury:lock-wait-since:')) {
        return Promise.resolve('OK');
      }
      return Promise.resolve(null);
    });

    const repo: jest.Mocked<
      Pick<TreasuryOperationRepositoryPort, 'findByOperationId' | 'updateByOperationId'>
    > = {
      findByOperationId: jest.fn(),
      updateByOperationId: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TreasuryOperationsService,
        {
          provide: RedisService,
          useValue: {
            getClient: () => ({
              set: redisSet,
              get: jest.fn().mockResolvedValue(null),
              del: jest.fn(),
              eval: jest.fn(),
              publish: jest.fn(),
            }),
          },
        },
        {
          provide: TransactionWalletService,
          useValue: {
            getWalletById: jest.fn(),
            getMainWalletAddress: jest.fn(),
          },
        },
        { provide: TreasuryMainWalletService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: SystemConfigService,
          useValue: { get: jest.fn(), getEffectiveString: jest.fn() },
        },
        { provide: TREASURY_OPERATION_REPOSITORY, useValue: repo },
        { provide: TREASURY_ONCHAIN_READ_REPOSITORY, useValue: {} },
        { provide: getQueueToken(TREASURY_QUEUE), useValue: { add: jest.fn(), getJob: jest.fn() } },
      ],
    }).compile();

    svc = moduleRef.get(TreasuryOperationsService);
    repo.findByOperationId?.mockResolvedValue({
      operation_id: 'op-1',
      type: 'FUND',
      chain: 'TRON_NILE',
      from_wallet_id: null,
      to_wallet_id: 'w1',
      amount: '1',
      asset: 'NATIVE',
      tx_hash: null,
      onchain_tx_id: null,
      status: 'PENDING',
      actor_user_id: 'u1',
      failure_reason: null,
      created_at: new Date(),
      completed_at: null,
    } as never);
  });

  it('throws TreasuryWalletBusyException when Redis lock is not acquired (fund)', async () => {
    await expect(svc.processFundJob({ operationId: 'op-1' })).rejects.toBeInstanceOf(
      TreasuryWalletBusyException,
    );
    expect(redisSet).toHaveBeenCalledWith('treasury:lock:w1', expect.any(String), 'EX', 300, 'NX');
    expect(redisSet).toHaveBeenCalledWith(
      'treasury:lock-wait-since:op-1',
      expect.any(String),
      'EX',
      25 * 60,
      'NX',
    );
  });
});
