import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '@/common/decorators/require-permissions.decorator';
import { REQUIRED_ROLES_KEY } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { ExchangeRateController } from './exchange-rate.controller';

describe('ExchangeRateController RBAC', () => {
  const reflector = new Reflector();

  it('protects admin routes for finance operations', () => {
    const financeRoles = reflector.get<UserRole[]>(
      REQUIRED_ROLES_KEY,
      ExchangeRateController.prototype.getAdminCurrentConfig,
    );
    const financePermissions = reflector.get<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      ExchangeRateController.prototype.getAdminCurrentConfig,
    );

    expect(financeRoles).toEqual([UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER]);
    expect(financePermissions).toEqual([Permission.PAYMENT_CONFIGS_MANAGE]);
  });

  it('keeps public market endpoints without RBAC metadata', () => {
    const roles = reflector.get<UserRole[]>(
      REQUIRED_ROLES_KEY,
      ExchangeRateController.prototype.getMarketPrices,
    );
    const permissions = reflector.get<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      ExchangeRateController.prototype.getMarketPrices,
    );

    expect(roles).toBeUndefined();
    expect(permissions).toBeUndefined();
  });
});
