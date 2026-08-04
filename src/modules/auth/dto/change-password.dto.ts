import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'New password (min 8 characters)',
    example: 'NewSecurePass123',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword!: string;

  @ApiProperty({
    description:
      'OTP code from email. Required when 2FA is enabled AND email verification is required. Optional when email verification is disabled by admin.',
    example: '123456',
    minLength: 6,
    maxLength: 6,
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  otpCode?: string;
}
