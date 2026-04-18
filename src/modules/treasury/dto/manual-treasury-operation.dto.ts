import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Body for POST .../manual-retry (SWEEP only: optional destination main wallet id). */
export class ManualRetryTreasuryOperationDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mainWalletId?: string;
}

export class ManualAbortTreasuryOperationDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

/**
 * Body for POST .../manual-settle — attest on-chain tx when automation is stuck but chain succeeded.
 * SWEEP: pass mainWalletId when sweep targeted a non-default main wallet.
 */
export class ManualSettleTreasuryOperationDto {
  @IsString()
  @MinLength(16)
  @MaxLength(255)
  txHash!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mainWalletId?: string;
}
