import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * Register DTO
 * Áp dụng: Data Transfer Object Pattern & Validation
 */
export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100, { message: 'Password must not exceed 100 characters' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MinLength(1, { message: 'First name must not be empty' })
  @MaxLength(100, { message: 'First name must not exceed 100 characters' })
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, { message: 'First name must contain only letters and spaces' })
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MinLength(1, { message: 'Last name must not be empty' })
  @MaxLength(100, { message: 'Last name must not exceed 100 characters' })
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, { message: 'Last name must contain only letters and spaces' })
  lastName!: string;
}
