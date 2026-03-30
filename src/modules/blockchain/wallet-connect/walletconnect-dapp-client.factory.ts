import SignClient from '@walletconnect/sign-client';

/**
 * Singleton SignClient (dapp / initiator) cho relay WalletConnect v2.
 * Dùng cho đăng nhập public (`WalletConnectAuthService`). Module liên kết ví JWT có thể tái dùng sau.
 */
let signClientPromise: Promise<SignClient> | null = null;

/** Tránh HTTP /init treo vô hạn khi relay WSS không auth được (JWT/đồng hồ) hoặc mạng chặn. */
const SIGN_CLIENT_INIT_TIMEOUT_MS = 18_000;

export function resetWalletConnectDappClientForTests(): void {
  signClientPromise = null;
}

export function getWalletConnectDappClient(params: {
  projectId: string;
  relayUrl: string;
}): Promise<SignClient> {
  if (!params.projectId) {
    return Promise.reject(new Error('WALLETCONNECT_PROJECT_ID is required for SignClient'));
  }
  if (!signClientPromise) {
    const relayUrl = params.relayUrl || 'wss://relay.walletconnect.com';
    const init = SignClient.init({
      projectId: params.projectId,
      relayUrl,
      metadata: {
        name: 'Kryptos Core',
        description: 'Cryptocurrency trading',
        url: 'https://reown.com',
        icons: ['https://reown.com/reown-logo.svg'],
      },
    });
    signClientPromise = Promise.race([
      init,
      new Promise<SignClient>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              'SignClient.init timeout: relay WSS không phản hồi. Kiểm tra firewall/egress, ' +
                'WALLETCONNECT_RELAY_URL, và đồng bộ giờ máy chủ Nest (NTP). ' +
                'Lỗi JWT iat trên relay thường do đồng hồ Windows/máy ảo chạy nhanh/chậm vài phút.',
            ),
          );
        }, SIGN_CLIENT_INIT_TIMEOUT_MS);
      }),
    ]).catch((err: unknown) => {
      signClientPromise = null;
      throw err;
    });
  }
  return signClientPromise;
}
