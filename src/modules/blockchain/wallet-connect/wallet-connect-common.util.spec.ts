import {
  parseTronCaip10Account,
  tronWcSignResultToBackendSignature,
} from './wallet-connect-common.util';

describe('wallet-connect-common.util', () => {
  describe('parseTronCaip10Account', () => {
    it('parses WalletConnect TRON CAIP-10 account id', () => {
      const full = 'tron:0xcd8690dc:TNYY1RPqXS3ws36ZkLPg1PEGUFaMHaV4dD';
      expect(parseTronCaip10Account(full)).toEqual({
        chainId: 'tron:0xcd8690dc',
        address: 'TNYY1RPqXS3ws36ZkLPg1PEGUFaMHaV4dD',
      });
    });

    it('throws on invalid account string', () => {
      expect(() => parseTronCaip10Account('eip155:1:0xabc')).toThrow(/Invalid TRON CAIP-10/);
    });
  });

  describe('tronWcSignResultToBackendSignature', () => {
    it('accepts hex string result', () => {
      expect(tronWcSignResultToBackendSignature('0xdeadbeef')).toBe('0xdeadbeef');
    });

    it('accepts object with signature field', () => {
      expect(tronWcSignResultToBackendSignature({ signature: '0xabc' })).toBe('0xabc');
    });

    it('throws on empty', () => {
      expect(() => tronWcSignResultToBackendSignature('')).toThrow(/empty TRON signature/);
    });
  });
});
