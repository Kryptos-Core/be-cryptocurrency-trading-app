import { Module } from '@nestjs/common';
import { BuildAdminEnumsQuery } from './application/queries/build-admin-enums.query';
import { MetadataController } from './metadata.controller';

@Module({
  controllers: [MetadataController],
  providers: [BuildAdminEnumsQuery],
})
export class MetadataModule {}
