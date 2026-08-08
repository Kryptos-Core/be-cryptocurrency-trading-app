import {
  InsufficientBalanceError,
  WalletLockedError,
  ChainUnavailableError,
  AmountBelowMinError,
  AmountAboveMaxError,
  WalletNotFoundError,
  InvalidAddressError,
} from './treasury-errors';
import { DomainError } from './domain-error.base';

describe('treasury errors', () => {
  it.each([
    [InsufficientBalanceError, 'TREASURY/INSUFFICIENT_BALANCE', 422],
    [WalletLockedError, 'TREASURY/WALLET_LOCKED', 423],
    [ChainUnavailableError, 'TREASURY/CHAIN_UNAVAILABLE', 503],
    [AmountBelowMinError, 'TREASURY/AMOUNT_BELOW_MIN', 422],
    [AmountAboveMaxError, 'TREASURY/AMOUNT_ABOVE_MAX', 422],
    [WalletNotFoundError, 'TREASURY/WALLET_NOT_FOUND', 404],
    [InvalidAddressError, 'TREASURY/INVALID_ADDRESS', 422],
  ])('%p has correct code + httpStatus', (Ctor, code, status) => {
    const err = new Ctor();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe(code);
    expect(err.httpStatus).toBe(status);
  });

  it('does not leak internal chain details in userMessage', () => {
    const err = new ChainUnavailableError({ chain: 'ETH-MAINNET', rpc: 'internal-rpc.acme.io' });
    expect(err.userMessage).not.toContain('internal-rpc.acme.io');
    expect(err.userMessage).not.toContain('ETH-MAINNET');
  });
});
