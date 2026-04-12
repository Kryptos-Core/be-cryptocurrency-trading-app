import { UserRole } from '@/common/enums';
import { RequireRoles } from './require-roles.decorator';

export const RequireFinanceAccess = () =>
  RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER);

export const RequireAdminOrSupport = () =>
  RequireRoles(UserRole.ADMIN, UserRole.SUPPORT_AGENT, UserRole.RISK_OFFICER);