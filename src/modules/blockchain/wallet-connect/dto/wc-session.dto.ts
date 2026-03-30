export enum WcSessionStatus {
  PENDING = 'pending',       // Session URI đã tạo, chờ user scan QR
  CONNECTED = 'connected',   // Wallet đã kết nối, chờ ký
  SIGNED = 'signed',         // Đã nhận signature, FE cần gọi verify-link
  EXPIRED = 'expired',       // Quá TTL 5 phút
  FAILED = 'failed',         // Lỗi trong quá trình
}

export interface WcSessionData {
  sessionId: string;
  userId: string;
  chain: string;
  wcUri: string;
  nonce: string;
  message: string;
  status: WcSessionStatus;
  address?: string;
  signature?: string;
  createdAt: number;
}
