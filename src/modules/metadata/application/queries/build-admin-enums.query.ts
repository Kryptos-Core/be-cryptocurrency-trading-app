import { Injectable } from '@nestjs/common';
import { buildAdminEnumsPayload } from '../../admin-enums.builder';

@Injectable()
export class BuildAdminEnumsQuery {
  execute() {
    return buildAdminEnumsPayload();
  }
}
