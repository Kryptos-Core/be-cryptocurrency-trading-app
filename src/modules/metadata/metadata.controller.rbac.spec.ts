import { Reflector } from '@nestjs/core';
import { REQUIRED_ROLES_KEY } from '@/common/decorators/require-roles.decorator';
import { UserRole } from '@/common/enums';
import { MetadataController } from './metadata.controller';

describe('MetadataController RBAC', () => {
  it('getAdminEnums is limited to ops desk roles (not TRADER / MARKET_MAKER)', () => {
    const reflector = new Reflector();
    const roles = reflector.get<UserRole[]>(
      REQUIRED_ROLES_KEY,
      MetadataController.prototype.getAdminEnums,
    );
    expect(roles).toEqual([
      UserRole.ADMIN,
      UserRole.RISK_OFFICER,
      UserRole.SUPPORT_AGENT,
      UserRole.FINANCE_MANAGER,
    ]);
  });
});
