import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@/common/enums';
import { REQUIRED_ROLES_KEY } from '@/common/decorators/require-roles.decorator';
import { ForbiddenException } from '@/common/exceptions';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const role = user?.role as UserRole | undefined;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('Insufficient role privileges');
    }

    return true;
  }
}
