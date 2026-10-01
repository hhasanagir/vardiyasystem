import { registerAs } from '@nestjs/config';

export default registerAs('rateLimit', () => ({
  global: {
    ttl: parseInt(process.env.GLOBAL_THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.GLOBAL_THROTTLE_LIMIT || '200', 10),
  },
  auth: {
    login: {
      limit: parseInt(process.env.AUTH_LOGIN_LIMIT || '10', 10),
      windowMs: parseInt(process.env.AUTH_LOGIN_WINDOW_MS || '60000', 10),
    },
    register: {
      limit: parseInt(process.env.AUTH_REGISTER_LIMIT || '3', 10),
      windowMs: parseInt(process.env.AUTH_REGISTER_WINDOW_MS || '60000', 10),
    },
    refresh: {
      limit: parseInt(process.env.AUTH_REFRESH_LIMIT || '10', 10),
      windowMs: parseInt(process.env.AUTH_REFRESH_WINDOW_MS || '60000', 10),
    },
  },
  lockout: {
    threshold: parseInt(process.env.AUTH_LOCKOUT_THRESHOLD || '5', 10),
    durationMs: parseInt(process.env.AUTH_LOCKOUT_DURATION_MS || '900000', 10),
    progressiveFactor: parseFloat(
      process.env.AUTH_LOCKOUT_PROGRESSIVE_FACTOR || '1.5',
    ),
    maxDurationMs: parseInt(
      process.env.AUTH_LOCKOUT_MAX_DURATION_MS || '86400000',
      10,
    ),
  },
  ws: {
    connection: {
      limit: parseInt(process.env.WS_CONNECTION_LIMIT || '10', 10),
      windowMs: parseInt(process.env.WS_CONNECTION_WINDOW_MS || '60000', 10),
    },
    reconnectCooldownMs: parseInt(
      process.env.WS_RECONNECT_COOLDOWN_MS || '2000',
      10,
    ),
  },
  proxy: {
    trustLevel: parseInt(process.env.TRUST_PROXY_LEVEL || '1', 10),
  },
}));
