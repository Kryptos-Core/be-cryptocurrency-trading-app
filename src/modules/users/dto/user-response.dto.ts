/**
 * User Response DTO
 * Chỉ expose những field cần thiết, không trả về sensitive data
 */
export class UserResponseDto {
  user_id!: number;
  email!: string;
  status!: string;
  created_at!: Date;
}
