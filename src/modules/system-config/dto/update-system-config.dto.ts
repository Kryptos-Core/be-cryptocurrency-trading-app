import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateSystemConfigDto {
  @ApiProperty({ description: 'Giá trị mới của config' })
  @IsString()
  @IsNotEmpty()
  value!: string;
}
