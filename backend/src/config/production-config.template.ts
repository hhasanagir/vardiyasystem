export interface ProductionConfig {
  database: {
    url: string;
    directUrl?: string;
    poolSize: number;
    statementCacheSize: number;
  };
  redis: {
    url: string;
    keyPrefix: string;
    maxRetriesPerRequest: number;
  };
  jwt: {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    accessTokenExpiresIn: string;
    refreshTokenExpiresIn: string;
  };
  rateLimit: {
    global: { ttlMs: number; limit: number };
    auth: { login: number; register: number; refresh: number };
    schedule: { approve: number; publish: number; rollback: number };
  };
  cors: {
    origin: string;
    credentials: boolean;
  };
  websocket: {
    connectionLimit: number;
    reconnectCooldownMs: number;
  };
  health: {
    livenessPath: string;
    readinessPath: string;
  };
  logging: {
    level: 'error' | 'warn' | 'log' | 'debug' | 'verbose';
    format: 'json' | 'text';
  };
}

export type ProductionConfigDefaults = Partial<{
  database: Partial<ProductionConfig['database']>;
  redis: Partial<ProductionConfig['redis']>;
  rateLimit: ProductionConfig['rateLimit'];
  cors: Partial<ProductionConfig['cors']>;
  websocket: Partial<ProductionConfig['websocket']>;
  health: Partial<ProductionConfig['health']>;
  logging: Partial<ProductionConfig['logging']>;
}>;

export const PRODUCTION_DEFAULTS: ProductionConfigDefaults = {
  database: {
    poolSize: 25,
    statementCacheSize: 500,
  },
  redis: {
    keyPrefix: 'vardiya:',
    maxRetriesPerRequest: 3,
  },
  rateLimit: {
    global: { ttlMs: 60000, limit: 200 },
    auth: { login: 10, register: 3, refresh: 10 },
    schedule: { approve: 10, publish: 5, rollback: 5 },
  },
  cors: {
    credentials: true,
  },
  websocket: {
    connectionLimit: 10,
    reconnectCooldownMs: 2000,
  },
  health: {
    livenessPath: '/api/v1/health/live',
    readinessPath: '/api/v1/health/ready',
  },
  logging: {
    level: 'log',
    format: 'json',
  },
};
