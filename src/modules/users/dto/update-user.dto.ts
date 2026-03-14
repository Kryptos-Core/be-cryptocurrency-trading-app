import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@/common/enums';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'User status',
    enum: ['ACTIVE', 'BANNED', 'PENDING'],
    example: 'ACTIVE',
  })
  @IsEnum(['ACTIVE', 'BANNED', 'PENDING'])
  @IsOptional()
  status?: 'ACTIVE' | 'BANNED' | 'PENDING';

  @ApiPropertyOptional({
    description: 'User RBAC role',
    enum: Object.values(UserRole),
    example: UserRole.TRADER,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
