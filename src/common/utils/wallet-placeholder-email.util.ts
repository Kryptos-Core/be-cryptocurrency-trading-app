/**
 * Synthetic login email for wallet-only accounts (see WalletAuthService.placeholderEmail).
 * Example: `a1b2c3d4@eth_sepolia.wallet`
 */
export function isWalletPlaceholderEmail(email: string | null | undefined): boolean {
  if (email == null || typeof email !== 'string') return false;
  return email.trim().toLowerCase().endsWith('.wallet');
}
