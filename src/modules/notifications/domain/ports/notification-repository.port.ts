export interface NotificationRow {
  id: string;
  user_id: string;
  notification_id: string;
  is_read: number;
  read_at: Date | null;
  created_at: Date;
  title: string;
  body: string;
  type: string;
  created_by: string;
  data: Record<string, unknown> | null;
  notification_created_at: Date;
}

export interface NotificationRepositoryPort {
  createViaProcedure(params: {
    notificationId: string;
    title: string;
    body: string;
    type: string;
    createdBy: string;
    data: Record<string, unknown> | null;
  }): Promise<{ notification_id: string } | null>;
  findByUser(userId: string, limit: number, offset: number): Promise<NotificationRow[]>;
  countUnread(userId: string): Promise<number>;
  markRead(notificationId: string, userId: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
  findAllFcmTokens(): Promise<string[]>;
  getFcmTokenByUserId(userId: string): Promise<string | null>;
  createForUser(params: {
    notificationId: string;
    title: string;
    body: string;
    type: string;
    createdBy: string;
    targetUserId: string;
    data: Record<string, unknown> | null;
  }): Promise<void>;
}
