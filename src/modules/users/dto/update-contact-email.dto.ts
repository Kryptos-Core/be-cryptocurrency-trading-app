import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Direct email update DTO — bypasses OTP when email verification is disabled by admin.
 */
export class UpdateContactEmailDto {
  @ApiProperty({
    description: 'New contact email address',
    example: 'real@example.com',
  })
  @IsString()
  @IsNotEmpty()
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;
}
