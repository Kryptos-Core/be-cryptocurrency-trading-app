import { ApiProperty } from '@nestjs/swagger';

export class DevUserPickDto {
  @ApiProperty({ description: 'User ID (UUID)', example: '018e9a7b-1234-7abc-8000-000000000001' })
  userId!: string;

  @ApiProperty({ description: 'User email', format: 'email', example: 'sandbox-admin@example.com' })
  email!: string;

  @ApiProperty({ description: 'First name', example: 'Admin', nullable: true })
  firstName!: string | null;

  @ApiProperty({ description: 'Last name', example: 'User', nullable: true })
  lastName!: string | null;

  @ApiProperty({
    description: 'User role',
    enum: ['TRADER', 'ADMIN', 'RISK_OFFICER', 'SUPPORT_AGENT', 'MARKET_MAKER', 'FINANCE_MANAGER'],
    example: 'ADMIN',
  })
  role!: string;

  @ApiProperty({ description: 'User status', enum: ['ACTIVE', 'BANNED', 'PENDING'], example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ description: 'Avatar URL', nullable: true, example: 'https://example.com/a.png' })
  avatarUrl!: string | null;

  @ApiProperty({ description: 'Created at', type: String, format: 'date-time' })
  createdAt!: Date;
}
