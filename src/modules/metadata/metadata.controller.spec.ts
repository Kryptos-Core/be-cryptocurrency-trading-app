import { MetadataController } from './metadata.controller';
import { buildAdminEnumsPayload } from './admin-enums.builder';

describe('MetadataController', () => {
  it('returns same payload as buildAdminEnumsPayload', () => {
    const controller = new MetadataController();
    expect(controller.getAdminEnums()).toEqual(buildAdminEnumsPayload());
  });
});
