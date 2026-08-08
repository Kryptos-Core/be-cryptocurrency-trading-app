import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  BLOCKCHAIN_CHAIN_DB_VALUES,
  type BlockchainChainDbValue,
} from '@/common/constants/blockchain-chain-db';

export type TreasuryMainWalletChainDto = BlockchainChainDbValue;

const SUPPORTED_CHAINS = [...BLOCKCHAIN_CHAIN_DB_VALUES] as const;

/**
 * DTO for importing a new treasury main wallet via private key.
 * Requires MFA code (TOTP 2FA) from the acting user.
 */
export class ImportMainWalletDto {
  @ApiProperty({
    description: 'Blockchain network for this main wallet',
    enum: SUPPORTED_CHAINS,
    example: 'TRON_MAINNET',
  })
  @IsIn(SUPPORTED_CHAINS)
  chain!: TreasuryMainWalletChainDto;

  @ApiProperty({
    description:
      'Raw private key (hex for ETH/TRON, Base58 for Solana). Transmitted over HTTPS only.',
    example: '27b0a19f8390cef6a971ce3bf02197ba388a26d319a6bce7054972cba71678fa',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(256)
  privateKey!: string;

  @ApiPropertyOptional({
    description: 'Human-readable label for this wallet',
    example: 'TRON Mainnet Primary',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description:
      'TOTP 6-digit 2FA code from authenticator app. Required when admin has TOTP gating enabled for treasury main wallets (default). Optional when admin has disabled it (sandbox / internal env only — see AUTH_SECURITY settings).',
    example: '123456',
  })
  @IsString()
  @IsOptional()
  @MinLength(6)
  @MaxLength(8)
  mfaCode?: string;
}

/**
 * DTO for approving or rejecting a pending main wallet import.
 * Only Risk Officer can call these endpoints.
 */
export class ReviewMainWalletDto {
  @ApiPropertyOptional({
    description: 'Optional note for the approval/rejection decision',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}

/** Email OTP — same verification as import main wallet. */
export class RevealMainWalletPrivateKeyDto {
  @ApiPropertyOptional({
    description:
      'TOTP 6-digit 2FA code. Required when admin has TOTP gating enabled for treasury main wallets (default). Optional when admin has disabled it (sandbox / internal env only — see AUTH_SECURITY settings).',
    example: '123456',
  })
  @IsString()
  @IsOptional()
  @MinLength(6)
  @MaxLength(8)
  mfaCode?: string;
}

export class UpdateMainWalletDto {
  @ApiPropertyOptional({ description: 'Display label', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string | null;
}
