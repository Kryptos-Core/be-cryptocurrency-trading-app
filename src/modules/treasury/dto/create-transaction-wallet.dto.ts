import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { BLOCKCHAIN_CHAIN_DB_VALUES, BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';

export class CreateTransactionWalletDto {
  @IsIn([...BLOCKCHAIN_CHAIN_DB_VALUES])
  chain!: BlockchainChainDbValue;

  @IsEnum(['DEPOSIT', 'WITHDRAWAL', 'BOTH'])
  purpose!: 'DEPOSIT' | 'WITHDRAWAL' | 'BOTH';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;
}
