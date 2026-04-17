export type UserRoleRecord =
  | 'TRADER'
  | 'ADMIN'
  | 'RISK_OFFICER'
  | 'SUPPORT_AGENT'
  | 'MARKET_MAKER'
  | 'FINANCE_MANAGER';

export interface UserRecord {
  user_id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  two_fa_secret: Buffer | null;
  status: 'ACTIVE' | 'BANNED' | 'PENDING';
  role: UserRoleRecord;
  identity_verified: number;
  email_verified: number;
  avatar_url: string | null;
  avatar_public_id: string | null;
  fcm_token: string | null;
  two_fa_enabled: number;
  created_at: Date;
}
