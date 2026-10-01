import { Logger } from '@nestjs/common';

const logger = new Logger('FeatureFlags');

const FLAGS: Record<string, boolean> = {};

export function initFeatureFlags(): void {
  const flagNames = [
    'ENABLE_REALTIME_COLLABORATION',
    'ENABLE_ADVANCED_AUDIT',
    'ENABLE_FOUR_EYES_APPROVAL',
    'ENABLE_SCHEDULE_GENERATION_ASYNC',
    'ENABLE_OFFLINE_MODE',
    'ENABLE_EXPORT_ASYNC',
    'ENABLE_BIOMETRIC_AUTH',
  ];

  for (const name of flagNames) {
    FLAGS[name] = process.env[name] === 'true';
  }

  const enabled = Object.entries(FLAGS)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (enabled.length > 0) {
    logger.log(`Feature flags enabled: ${enabled.join(', ')}`);
  }
}

export function isFeatureEnabled(flagName: string): boolean {
  return FLAGS[flagName] ?? false;
}

// Call on module init
initFeatureFlags();
