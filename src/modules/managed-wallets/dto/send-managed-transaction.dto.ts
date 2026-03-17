import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendManagedTransactionDto {
  @ApiProperty({
    description: 'Destination Tron address',
    example: 'TYMwiDu22KaLrFhKQsaLxqW1M7c5yifC8o',
  })
  @IsString()
  @IsNotEmpty()
  to_address!: string;

  @ApiProperty({
    description: 'Amount of TRX to send',
    example: '10.5',
  })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiPropertyOptional({
    description: 'Optional memo kept only in app-level audit logs',
    example: 'Treasury rebalance',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  memo?: string;
}
