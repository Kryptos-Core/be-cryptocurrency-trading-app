import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UnauthorizedException } from '@/common/exceptions';
import { Permission, UserRole } from '@/common/enums';
import { getPermissionsForRole } from '@/common/authz/rbac-policy';
import { normalizeUserRole } from '@/common/authz/user-role.util';

/**
 * JWT Strategy - Xác thực token và inject user vào request
 * Áp dụng: Strategy Pattern (Design Pattern)
 */
export interface JwtPayload {
  sub: string; // user_id (UUID v7)
  email: string;
  role?: UserRole;
  /** JWT mới; token cũ có thể thiếu — legacy role VERIFIED_USER vẫn được công nhận ở validate(). */
  identityVerified?: boolean;
  /** Đã xác minh email qua OTP (2FA / luồng email liên hệ). Token cũ có thể thiếu → false. */
  emailVerified?: boolean;
  permissions?: Permission[];
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Validate JWT Payload
   * Được gọi tự động bởi Passport sau khi verify token
   */
  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const rawRole = payload.role as string | undefined;
    const role = normalizeUserRole(rawRole);
    const legacyVerified = rawRole === 'VERIFIED_USER';
    const identityVerified = payload.identityVerified === true || legacyVerified;
    const emailVerified = payload.emailVerified === true;
    const permissions = (payload.permissions as Permission[] | undefined)?.length
      ? (payload.permissions as Permission[])
      : (getPermissionsForRole(role) as Permission[]);

    return {
      userId: payload.sub,
      email: payload.email,
      role,
      roles: [role],
      permissions,
      identityVerified,
      emailVerified,
    };
  }
}
