import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRuntimeSettingsBulkDto {
  @ApiProperty({
    description: 'Map of runtime setting key → string value',
    example: { TRON_MAINNET_FULL_HOST: 'https://api.trongrid.io', WALLET_SYNC_INTERVAL: '60000' },
  })
  @IsObject()
  updates!: Record<string, string>;
}
