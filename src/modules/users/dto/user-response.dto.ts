/**
 * User Response DTO
 * Chỉ expose những field cần thiết, không trả về sensitive data
 * Pattern: DTO Pattern - Data Transfer Object
 */
export class UserResponseDto {
  user_id!: number;
  email!: string;
  first_name?: string;
  last_name?: string;
  status!: string;
  created_at!: Date;
}
