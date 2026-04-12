/** Adds `PassportStrategy` when the published package omits `passport.strategy.d.ts` from the barrel chain. */
import type {} from '@nestjs/passport';

declare module '@nestjs/passport' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function PassportStrategy(
    strategy: any,
    name?: string,
    callbackArity?: boolean | number,
  ): any;
}
