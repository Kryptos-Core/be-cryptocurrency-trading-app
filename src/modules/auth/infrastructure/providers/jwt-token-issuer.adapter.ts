import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenIssuerPort } from '@/modules/auth/application/ports/token-issuer.port';

/**
 * Infrastructure adapter: wraps NestJS JwtService behind the TokenIssuerPort.
 * Application-layer use cases depend only on the port interface.
 */
@Injectable()
export class JwtTokenIssuerAdapter implements TokenIssuerPort {
  constructor(private readonly jwtService: JwtService) {}

  sign(payload: Record<string, unknown>): string {
    return this.jwtService.sign(payload);
  }
}
