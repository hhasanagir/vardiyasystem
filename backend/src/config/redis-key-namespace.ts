export enum RedisKeyNamespace {
  LOCK = 'lock',
  THROTTLE = 'throttle',
  JWT_BLACKLIST = 'jwt:blacklist',
  SESSION = 'session',
  CACHE = 'cache',
  QUEUE = 'queue',
  RATE_LIMIT = 'ratelimit',
  WS_CONNECTION = 'ws:conn',
  CSRF = 'csrf',
  ACCOUNT_LOCK = 'lockout',
}

export function redisKey(
  namespace: RedisKeyNamespace,
  ...parts: string[]
): string {
  return `vardiya:${namespace}:${parts.join(':')}`;
}
