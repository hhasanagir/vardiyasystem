export const NOTIFICATION_PRIORITIES = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type NotificationPriority =
  (typeof NOTIFICATION_PRIORITIES)[keyof typeof NOTIFICATION_PRIORITIES];

export const PRIORITY_LEVELS: Record<NotificationPriority, number> = {
  LOW: 10,
  NORMAL: 20,
  HIGH: 30,
  CRITICAL: 40,
};

export const PRIORITY_MAX_RETRIES: Record<NotificationPriority, number> = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 5,
};

export const PRIORITY_BYPASS_PREFS: Record<NotificationPriority, boolean> = {
  LOW: false,
  NORMAL: false,
  HIGH: false,
  CRITICAL: true,
};
