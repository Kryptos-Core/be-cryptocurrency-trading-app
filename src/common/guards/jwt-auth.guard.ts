import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';
import { UnauthorizedException } from '@/common/exceptions';

/**
 * JWT Auth Guard - Protect routes with JWT authentication
 * Áp dụng: Guard Pattern & Open-Closed Principle (OCP)
 * Routes yêu cầu authentication sẽ dùng guard này
 * Routes public dùng @Public() decorator để bypass
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Call parent AuthGuard to validate JWT
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, _info: any) {
    // Customize error handling
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
