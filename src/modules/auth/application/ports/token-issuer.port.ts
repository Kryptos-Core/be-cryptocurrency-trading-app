export interface TokenIssuerPort {
  sign(payload: Record<string, unknown>): string;
}
