import { IsEmail, IsEnum, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(['ACTIVE', 'BANNED', 'PENDING'])
  @IsOptional()
  status?: 'ACTIVE' | 'BANNED' | 'PENDING';
}
