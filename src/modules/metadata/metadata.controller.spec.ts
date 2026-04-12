import { buildAdminEnumsPayload } from './admin-enums.builder';
import { MetadataController } from './metadata.controller';

describe('MetadataController', () => {
  it('returns same payload as buildAdminEnumsPayload', () => {
    const controller = new MetadataController();
    expect(controller.getAdminEnums()).toEqual(buildAdminEnumsPayload());
  });
});
