import type { WalletConnectSignClient } from '@walletconnect/sign-client';
import { getWalletConnectDappClient } from './walletconnect-dapp-client.factory';

/**
 * Serialize các lần gọi SignClient (chủ yếu `connect()` sinh URI).
 * Pairing/sign chạy **ngoài** lock (void .then) để POST /wc/init tiếp theo không bị treo
 * khi phiên trước vẫn chờ user quét QR.
 */
let signClientOpChain: Promise<unknown> = Promise.resolve();

export function withWalletConnectSignClientLock<T>(
  params: { projectId: string; relayUrl: string },
  fn: (client: WalletConnectSignClient) => Promise<T>,
): Promise<T> {
  const next = signClientOpChain.then(async (): Promise<T> => {
    const client = await getWalletConnectDappClient(params);
    return fn(client);
  });
  signClientOpChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
