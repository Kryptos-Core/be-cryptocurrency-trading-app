import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { BinancePermission } from '@/entities/user-binance-credentials.entity';

export class SaveBinanceCredentialsDto {
  @ApiProperty({
    description: 'User-friendly label for this API key set',
    example: 'Main Spot Account',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiProperty({
    description: 'Binance API Key',
    example: 'abc123def456...',
  })
  @IsString()
  @IsNotEmpty({ message: 'API Key is required' })
  @Matches(/^[A-Za-z0-9]{64}$/, {
    message: 'Binance API Key must be exactly 64 alphanumeric characters',
  })
  apiKey!: string;

  @ApiProperty({
    description: 'Binance API Secret',
    example: 'xyz789ghi012...',
  })
  @IsString()
  @IsNotEmpty({ message: 'API Secret is required' })
  @Matches(/^[A-Za-z0-9]{64}$/, {
    message: 'Binance API Secret must be exactly 64 alphanumeric characters',
  })
  apiSecret!: string;

  @ApiProperty({
    description: 'Permission scopes to enable',
    enum: BinancePermission,
    isArray: true,
    example: [BinancePermission.SPOT],
    default: [BinancePermission.SPOT],
  })
  @IsArray()
  @IsOptional()
  @IsIn([BinancePermission.SPOT, BinancePermission.FUTURES], { each: true })
  permissions?: BinancePermission[];

  @ApiProperty({
    description: 'Whether to use Binance testnet',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  testnet?: boolean;
}

export class BinanceCredentialsSummaryDto {
  @ApiProperty({ description: 'Credential ID' })
  id!: string;

  @ApiProperty({ description: 'User-friendly label', nullable: true })
  label!: string | null;

  @ApiProperty({
    description: 'Permission scopes',
    enum: BinancePermission,
    isArray: true,
  })
  permissions!: BinancePermission[];

  @ApiProperty({ description: 'Whether testnet is used' })
  testnet!: boolean;

  @ApiProperty({ description: 'Whether this credential is active' })
  is_active!: boolean;

  @ApiProperty({ description: 'Last time this credential was used', nullable: true })
  last_used_at!: string | null;

  @ApiProperty({ description: 'Creation timestamp' })
  created_at!: string;
}

export class SaveBinanceCredentialsResponseDto {
  @ApiProperty({ description: 'Credential ID' })
  id!: string;

  @ApiProperty({ description: 'Account identifier from Binance' })
  accountId!: string;

  @ApiProperty({ description: 'Account type (SPOT, MARGIN, etc.)' })
  accountType!: string;
}

export class TestConnectionResponseDto {
  @ApiProperty({ description: 'Whether the connection was successful' })
  success!: boolean;

  @ApiProperty({ description: 'Account ID from Binance', nullable: true })
  accountId!: string | null;

  @ApiProperty({ description: 'Account type', nullable: true })
  accountType!: string | null;

  @ApiProperty({ description: 'Error message if failed', nullable: true })
  error!: string | null;
}
