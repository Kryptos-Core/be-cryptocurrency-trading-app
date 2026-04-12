import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, Length } from 'class-validator';

export const SECURITY_CHANGE_TYPES = ['EMAIL_CHANGE', 'PASSWORD_CHANGE'] as const;
export type SecurityChangeType = (typeof SECURITY_CHANGE_TYPES)[number];

export class RequestSecurityChangeDto {
  @ApiProperty({
    description: 'Type of security change',
    enum: SECURITY_CHANGE_TYPES,
    example: 'EMAIL_CHANGE',
  })
  @IsEnum(SECURITY_CHANGE_TYPES)
  changeType!: SecurityChangeType;

  @ApiProperty({
    description:
      'Payload for the change (e.g. { email: "new@example.com" } or { password_hash: "..." })',
    example: { email: 'new@example.com' },
  })
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'OTP code (required when 2FA is enabled)',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  otpCode?: string;
}
