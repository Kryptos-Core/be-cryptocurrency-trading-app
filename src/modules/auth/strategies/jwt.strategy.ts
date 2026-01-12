import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UnauthorizedException } from '@/common/exceptions';

/**
 * JWT Strategy - Xác thực token và inject user vào request
 * Áp dụng: Strategy Pattern (Design Pattern)
 */
export interface JwtPayload {
  sub: number; // user_id
  email: string;
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

    // Return user object - sẽ được inject vào request.user
    return {
      userId: payload.sub,
      email: payload.email,
    };
  }
}
