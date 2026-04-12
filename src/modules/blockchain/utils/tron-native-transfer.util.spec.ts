import {
  extractTronFirstContractOwnerBase58,
  extractTronNativeTransferMeta,
  type TronWebAddressSun,
} from './tron-native-transfer.util';

describe('tron-native-transfer.util', () => {
  const mockTw: TronWebAddressSun = {
    address: {
      fromHex: (hex: string) => `BASE58(${hex.toLowerCase()})`,
    },
    fromSun: (sun: number | string | bigint) => (Number(sun) / 1_000_000).toFixed(6),
  };

  describe('extractTronNativeTransferMeta', () => {
    it('parses TransferContract with string type and populates from, to, value TRX', () => {
      const tx = {
        raw_data: {
          contract: [
            {
              type: 'TransferContract',
              parameter: {
                value: {
                  owner_address: '41aaa000000000000000000000000000000000001',
                  to_address: '41bbb000000000000000000000000000000000002',
                  amount: 1_500_000,
                },
              },
            },
          ],
        },
      };

      const r = extractTronNativeTransferMeta(mockTw, tx);
      expect(r).toEqual({
        from: 'BASE58(41aaa000000000000000000000000000000000001)',
        to: 'BASE58(41bbb000000000000000000000000000000000002)',
        value: '1.500000',
      });
    });

    it('accepts numeric contract type 1 (protobuf enum)', () => {
      const tx = {
        raw_data: {
          contract: [
            {
              type: 1,
              parameter: {
                value: {
                  owner_address: '41ccc000000000000000000000000000000000003',
                  to_address: '41ddd000000000000000000000000000000000004',
                  amount: '1000000',
                },
              },
            },
          ],
        },
      };

      const r = extractTronNativeTransferMeta(mockTw, tx);
      expect(r?.value).toBe('1.000000');
      expect(r?.from).toContain('41ccc');
    });

    it('parses owner/to when addresses are Uint8Array (some fullnode payloads)', () => {
      const ownerBytes = Uint8Array.from(
        Buffer.from('41aaa000000000000000000000000000000000001', 'hex'),
      );
      const toBytes = Uint8Array.from(
        Buffer.from('41bbb000000000000000000000000000000000002', 'hex'),
      );
      const tx = {
        raw_data: {
          contract: [
            {
              type: 'TransferContract',
              parameter: {
                value: {
                  owner_address: ownerBytes,
                  to_address: toBytes,
                  amount: 2_000_000,
                },
              },
            },
          ],
        },
      };

      const r = extractTronNativeTransferMeta(mockTw, tx);
      expect(r?.value).toBe('2.000000');
      expect(r?.from).toContain('41aaa');
    });

    it('returns null for TriggerSmartContract-only tx', () => {
      const tx = {
        raw_data: {
          contract: [
            {
              type: 'TriggerSmartContract',
              parameter: { value: { owner_address: '41eee000000000000000000000000000000000005' } },
            },
          ],
        },
      };

      expect(extractTronNativeTransferMeta(mockTw, tx)).toBeNull();
    });

    it('uses first TransferContract when multiple contracts exist', () => {
      const tx = {
        raw_data: {
          contract: [
            {
              type: 'TransferContract',
              parameter: {
                value: {
                  owner_address: '411111000000000000000000000000000000000001',
                  to_address: '412222000000000000000000000000000000000002',
                  amount: 1,
                },
              },
            },
            {
              type: 'TransferContract',
              parameter: {
                value: {
                  owner_address: '413333000000000000000000000000000000000003',
                  to_address: '414444000000000000000000000000000000000004',
                  amount: 2,
                },
              },
            },
          ],
        },
      };

      const r = extractTronNativeTransferMeta(mockTw, tx);
      expect(r?.value).toBe('0.000001');
      expect(r?.from).toContain('1111');
      expect(r?.to).toContain('2222');
    });
  });

  describe('extractTronFirstContractOwnerBase58', () => {
    it('returns empty when no owner', () => {
      expect(extractTronFirstContractOwnerBase58(mockTw, {})).toBe('');
    });

    it('returns base58 from first contract owner', () => {
      const tx = {
        raw_data: {
          contract: [
            {
              type: 'TriggerSmartContract',
              parameter: {
                value: { owner_address: '41fff00000000000000000000000000000000000f' },
              },
            },
          ],
        },
      };
      expect(extractTronFirstContractOwnerBase58(mockTw, tx)).toBe(
        'BASE58(41fff00000000000000000000000000000000000f)',
      );
    });
  });
});
