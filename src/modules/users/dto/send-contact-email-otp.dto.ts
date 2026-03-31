import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class SendContactEmailOtpDto {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
