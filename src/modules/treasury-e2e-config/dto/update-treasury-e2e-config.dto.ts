import { PartialType } from '@nestjs/mapped-types';
import { CreateTreasuryE2EConfigDto } from './create-treasury-e2e-config.dto';

export class UpdateTreasuryE2EConfigDto extends PartialType(CreateTreasuryE2EConfigDto) {}
