import { ApiProperty } from '@nestjs/swagger';

/**
 * Wallet Ledger Entry DTO
 * One ledger row for transaction history (GET /wallets/ledger)
 */
export class WalletLedgerEntryDto {
  @ApiProperty({ description: 'Reference type', example: 'DEPOSIT' })
  refType!: string;

  @ApiProperty({ description: 'Reference ID', example: 12345 })
  refId!: number;

  @ApiProperty({ description: 'Direction: CREDIT or DEBIT', example: 'CREDIT' })
  direction!: string;

  @ApiProperty({ description: 'Amount', example: '10.5' })
  amount!: string;

  @ApiProperty({ description: 'Created at (ISO 8601)', example: '2026-02-08T10:00:00.000Z' })
  createdAt!: string;
}
