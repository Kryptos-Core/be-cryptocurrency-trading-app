import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@/common/enums';

export const REQUIRED_ROLES_KEY = 'requiredRoles';

export const RequireRoles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);
