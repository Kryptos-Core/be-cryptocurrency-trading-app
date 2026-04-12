import type { BlockchainNetwork } from '@/common/enums';
import type { BlockchainTxStatusDto } from '../interfaces';

export function buildNotFoundTxStatus(
  txHash: string,
  network: BlockchainNetwork,
): BlockchainTxStatusDto {
  return {
    txHash,
    network,
    status: 'NOT_FOUND',
    confirmations: 0,
    from: '',
    to: '',
    value: '0',
  };
}