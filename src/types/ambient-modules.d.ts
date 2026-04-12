/**
 * Ambient typings for packages whose published tarballs omit typings or ship incomplete .d.ts chains
 * (local node_modules / registry quirks). Keeps `strict` builds green without weakening app source.
 */

declare module 'bull' {
  export interface RedisOptions {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  }
  export interface QueueOptions {
    redis?: RedisOptions | string;
    url?: string;
    prefix?: string;
    defaultJobOptions?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    limiter?: Record<string, unknown>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class Queue<T = any> {
    constructor(name: string, opts?: QueueOptions);
    add(
      name: string,
      data: T,
      opts?: Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export interface Job<T = any> {
    id: string | number | undefined;
    data: T;
  }
}

declare module '@walletconnect/sign-client' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type WalletConnectSignClient = any;

  interface SignClientStatic {
    init(opts: Record<string, unknown>): Promise<WalletConnectSignClient>;
  }

  const SignClient: SignClientStatic;
  export default SignClient;
}

declare module '@walletconnect/utils' {
  export function getAddressFromAccount(account: string): string;
  export function getChainFromAccount(account: string): string;
}

declare module 'cloudinary' {
  export interface UploadApiResponse {
    secure_url?: string;
    public_id?: string;
    [key: string]: unknown;
  }

  export interface V2Uploader {
    upload_stream: (
      options: Record<string, unknown>,
      callback: (err: Error | undefined, result?: UploadApiResponse) => void,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => any;
    destroy: (
      publicId: string,
      callback?: (err: Error | undefined, result?: { result?: string }) => void,
    ) => Promise<{ result?: string }>;
  }

  export const v2: {
    config: (opts: Record<string, unknown>) => void;
    uploader: V2Uploader;
  };
}
