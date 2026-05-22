export type NotificationType =
  | 'like_received'
  | 'dm_received'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'payment_refunded'
  | 'daily_log'
  | 'report_status'
  | 'block_status'
  | 'system';

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  body: string | null;
  dedupe_key?: string | null;
  route: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type RegisterPushTokenInput = {
  appVersion?: string | null;
  deviceLabel?: string | null;
  installationIdHash: string;
  platform: 'ios' | 'android' | 'web';
  pushProvider?: 'expo' | 'apns' | 'fcm';
  pushToken: string;
};
