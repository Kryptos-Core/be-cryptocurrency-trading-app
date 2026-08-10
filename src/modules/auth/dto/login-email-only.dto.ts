import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginEmailOnlyDto {
  @ApiProperty({
    description: 'User email address (sandbox-only login)',
    example: 'sandbox-admin@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;
}
