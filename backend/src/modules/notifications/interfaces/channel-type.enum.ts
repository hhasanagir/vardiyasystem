export const DELIVERY_CHANNELS = {
  IN_APP: 'IN_APP',
  WEB_PUSH: 'WEB_PUSH',
  FCM: 'FCM',
  EMAIL: 'EMAIL',
  SMS: 'SMS',
} as const;

export type DeliveryChannel =
  (typeof DELIVERY_CHANNELS)[keyof typeof DELIVERY_CHANNELS];

export const DELIVERY_CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  IN_APP: 'Uygulama İçi',
  WEB_PUSH: 'Web Push',
  FCM: 'Mobil Push',
  EMAIL: 'E-posta',
  SMS: 'SMS',
};
