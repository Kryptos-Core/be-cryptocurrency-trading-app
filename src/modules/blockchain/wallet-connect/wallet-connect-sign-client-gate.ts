import type SignClient from '@walletconnect/sign-client';
import { getWalletConnectDappClient } from './walletconnect-dapp-client.factory';

/**
 * Chuỗi toàn bộ thao tác trên SignClient singleton (connect → approval → request → disconnect).
 * Tránh race khi nhiều POST /wc/init đồng thời và giảm lỗi relay/topic nội bộ SDK.
 */
let signClientOpChain: Promise<unknown> = Promise.resolve();

export function withWalletConnectSignClientLock<T>(
  params: { projectId: string; relayUrl: string },
  fn: (client: SignClient) => Promise<T>,
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
