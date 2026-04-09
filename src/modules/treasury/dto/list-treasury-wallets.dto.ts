import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { BLOCKCHAIN_CHAIN_DB_VALUES, BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';

export class ListTreasuryWalletsDto {
  @IsOptional()
  @IsIn([...BLOCKCHAIN_CHAIN_DB_VALUES])
  chain?: BlockchainChainDbValue;

  @IsOptional()
  @IsEnum(['DEPOSIT', 'WITHDRAWAL', 'BOTH'])
  purpose?: 'DEPOSIT' | 'WITHDRAWAL' | 'BOTH';
}
