import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export type TreasuryMainWalletChainDto =
  | 'ETH_SEPOLIA'
  | 'ETH_MAINNET'
  | 'TRON_NILE'
  | 'TRON_SHASTA'
  | 'TRON_MAINNET'
  | 'SOLANA_DEVNET'
  | 'SOLANA_MAINNET';

const SUPPORTED_CHAINS: TreasuryMainWalletChainDto[] = [
  'ETH_SEPOLIA', 'ETH_MAINNET',
  'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET',
  'SOLANA_DEVNET', 'SOLANA_MAINNET',
];

/**
 * DTO for importing a new treasury main wallet via private key.
 * Requires MFA code (TOTP 2FA) from the acting user.
 */
export class ImportMainWalletDto {
  @ApiProperty({
    description: 'Blockchain network for this main wallet',
    enum: SUPPORTED_CHAINS,
    example: 'TRON_NILE',
  })
  @IsEnum(SUPPORTED_CHAINS)
  chain!: TreasuryMainWalletChainDto;

  @ApiProperty({
    description: 'Raw private key (hex for ETH/TRON, Base58 for Solana). Transmitted over HTTPS only.',
    example: '27b0a19f8390cef6a971ce3bf02197ba388a26d319a6bce7054972cba71678fa',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(256)
  privateKey!: string;

  @ApiPropertyOptional({
    description: 'Human-readable label for this wallet',
    example: 'TRON Nile Primary',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;

  @ApiProperty({
    description: 'TOTP 6-digit 2FA code from authenticator app (required)',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(8)
  mfaCode!: string;
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
