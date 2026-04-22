import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MatchDepositDto {
  @ApiProperty({ description: 'User ID được gán cho deposit UNMATCHED này', example: 'uuid-v7' })
  @IsUUID()
  userId!: string;
}
