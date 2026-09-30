import type { LogLevel, NodeEnv } from './config.constants';

export interface EnvIssue {
  key: string;
  message: string;
}

export type FileReader = (path: string) => string;

/**
 * Validated, typed application configuration. Keys are the camelCase form of
 * the environment variables in SPEC section 10 (JWT_ACCESS_TTL_SECONDS becomes
 * jwtAccessTtlSeconds). Secrets are already resolved from their `*_FILE`
 * variants, and `databaseUrl` is already built when DB_* parts are used.
 */
export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtAccessTtlSeconds: number;
  jwtIssuer: string;
  jwtAudience: string;
  refreshTokenTtlSeconds: number;
  refreshFamilyTtlSeconds: number;
  refreshCookiePath: string;
  refreshCookieName: string;
  cookieSecure: boolean;
  allowedOrigins: string[];
  corsOrigins: string[];
  bcryptCost: number;
  loginMaxFailedAttempts: number;
  loginLockoutMaxSeconds: number;
  throttleLoginLimit: number;
  throttleRefreshLimit: number;
  throttleGlobalLimit: number;
  idempotencyTtlSeconds: number;
  businessTimezone: string;
  swaggerEnabled: boolean;
  logLevel: LogLevel;
  seedDemoPassword: string | undefined;
  seedOnStart: boolean;
}
