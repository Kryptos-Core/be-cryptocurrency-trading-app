import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { UnauthorizedException } from '@/common/exceptions';

function hasBearerHeader(req: { headers?: { authorization?: unknown } }): boolean {
  const a = req.headers?.authorization;
  return typeof a === 'string' && a.startsWith('Bearer ');
}

/**
 * Cho phép gọi API không kèm JWT (khách xem dữ liệu công khai).
 * Nếu client gửi `Authorization: Bearer …` thì token phải hợp lệ — sai/hết hạn vẫn 401.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!hasBearerHeader(req)) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    const req = context.switchToHttp().getRequest();
    if (!hasBearerHeader(req)) {
      return undefined as TUser;
    }
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
