import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { BLOCKCHAIN_CHAIN_DB_VALUES, type BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';

const DECIMAL_STRING = /^\d+(\.\d+)?$/;

export class CreateTreasuryE2EConfigDto {
  @IsString()
  @IsIn(['development', 'staging', 'test', 'production'])
  environment!: 'development' | 'staging' | 'test' | 'production';

  @IsString()
  @IsNotEmpty()
  display_name!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  api_base_url!: string;

  @IsString()
  @IsIn([...BLOCKCHAIN_CHAIN_DB_VALUES])
  chain!: BlockchainChainDbValue;

  @IsOptional()
  @IsString()
  linked_wallet_id?: string | null;

  @IsString()
  @Matches(DECIMAL_STRING)
  withdraw_amount_auto!: string;

  @IsString()
  @Matches(DECIMAL_STRING)
  withdraw_amount_manual!: string;

  @IsOptional()
  @IsString()
  deposit_tx_hash?: string | null;

  @IsOptional()
  @Matches(DECIMAL_STRING)
  deposit_amount?: string | null;

  @IsBoolean()
  allow_skip!: boolean;

  @IsBoolean()
  health_fail_on_critical!: boolean;

  @IsInt()
  @Min(1)
  @Max(1440)
  stale_manual_minutes!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  stale_confirming_minutes!: number;

  @IsInt()
  @Min(1)
  @Max(100000)
  failed_withdrawals_24h!: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  reconcile_pair_limit!: number;

  @IsString()
  @Matches(DECIMAL_STRING)
  reconciliation_threshold!: string;

  @IsOptional()
  @IsString()
  trader_bearer_token?: string;

  @IsOptional()
  @IsString()
  risk_bearer_token?: string;

  @IsOptional()
  @IsString()
  trader_user_id?: string;

  @IsOptional()
  @IsString()
  risk_user_id?: string;
}
