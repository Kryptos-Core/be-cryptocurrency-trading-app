import { BlockchainNetwork } from '@/common/enums';
import { isWcTronChain, WC_RELAY_PAIRING_CHAINS, wcCaip2ForChain } from './wc-caip.util';

describe('wc-caip.util', () => {
  describe('WC_RELAY_PAIRING_CHAINS', () => {
    it('includes TRON networks for SignClient relay pairing', () => {
      expect(WC_RELAY_PAIRING_CHAINS).toContain(BlockchainNetwork.TRON_MAINNET);
      expect(WC_RELAY_PAIRING_CHAINS).toContain(BlockchainNetwork.TRON_NILE);
      expect(WC_RELAY_PAIRING_CHAINS).toContain(BlockchainNetwork.TRON_SHASTA);
    });
  });

  describe('isWcTronChain', () => {
    it('returns true only for TRON enum variants', () => {
      expect(isWcTronChain(BlockchainNetwork.TRON_NILE)).toBe(true);
      expect(isWcTronChain(BlockchainNetwork.BSC_MAINNET)).toBe(false);
    });
  });

  describe('wcCaip2ForChain', () => {
    it('returns tron CAIP-2 for Nile', () => {
      expect(wcCaip2ForChain(BlockchainNetwork.TRON_NILE)).toBe('tron:0xcd8690dc');
    });
  });
});
