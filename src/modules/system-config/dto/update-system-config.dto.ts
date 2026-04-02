import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSystemConfigDto {
  @ApiProperty({ description: 'Giá trị mới của config' })
  @IsString()
  @IsNotEmpty()
  value!: string;
}
