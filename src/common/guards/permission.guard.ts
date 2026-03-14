import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, UserRole } from '@/common/enums';
import { REQUIRED_PERMISSIONS_KEY } from '@/common/decorators/require-permissions.decorator';
import { ForbiddenException } from '@/common/exceptions';
import { hasPermission } from '@/common/authz/rbac-policy';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const role = user?.role as UserRole | undefined;

    if (!hasPermission(role, requiredPermissions)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
