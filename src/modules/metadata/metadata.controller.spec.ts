import { buildAdminEnumsPayload } from './admin-enums.builder';
import { BuildAdminEnumsQuery } from './application/queries/build-admin-enums.query';
import { MetadataController } from './metadata.controller';

describe('MetadataController', () => {
  it('returns same payload as buildAdminEnumsPayload', () => {
    const query = { execute: () => buildAdminEnumsPayload() } as BuildAdminEnumsQuery;
    const controller = new MetadataController(query);
    expect(controller.getAdminEnums()).toEqual(buildAdminEnumsPayload());
  });
});
