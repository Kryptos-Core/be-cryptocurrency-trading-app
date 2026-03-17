import { IsString, IsNotEmpty, IsEnum, IsOptional, IsObject, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@/entities/notification.entity';

export class CreateNotificationDto {
  @ApiProperty({ example: 'System Maintenance', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ example: 'Scheduled maintenance at 02:00 UTC tonight.' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiProperty({ enum: ['system', 'alert', 'promo'], default: 'system' })
  @IsEnum(['system', 'alert', 'promo'])
  @IsOptional()
  type?: NotificationType = 'system';

  @ApiPropertyOptional({ description: 'Extra JSON payload', example: { url: '/markets' } })
  @IsObject()
  @IsOptional()
  data?: Record<string, any>;
}
