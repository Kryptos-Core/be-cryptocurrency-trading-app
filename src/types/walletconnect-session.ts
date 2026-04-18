/**
 * Session shape after WalletConnect `connect()` approval (namespaces used by BE pairing flows).
 * Defined locally because some `@walletconnect/types` builds omit `SessionTypes` re-exports or session .d.ts files.
 */
export interface WcApprovedSession {
  topic: string;
  namespaces?: {
    solana?: { accounts?: string[] };
    eip155?: { accounts?: string[] };
    tron?: { accounts?: string[] };
  };
}

export type WcConnectPairingResult = {
  uri?: string;
  approval: () => Promise<WcApprovedSession>;
};
