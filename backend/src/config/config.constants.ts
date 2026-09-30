export const NODE_ENVS = ['development', 'production', 'test'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Accepted spellings of a boolean environment variable, after trim and lowercase. */
export const BOOLEAN_ENV_VALUES = ['true', 'false', '1', '0'] as const;

export const DEFAULT_BUSINESS_TIMEZONE = 'UTC';

export const BCRYPT_COST_MIN = 4;
export const BCRYPT_COST_MAX = 15;
export const BCRYPT_COST_DEFAULT = 12;

/** Shortest accepted SEED_DEMO_PASSWORD, in characters. */
export const MIN_SEED_PASSWORD_LENGTH = 15;

/** bcrypt only reads the first 72 bytes, so longer passwords are rejected (SPEC 7.4, A-18). */
export const MAX_PASSWORD_BYTES = 72;

/** Public example values from `.env.example`; a production start with one of them is refused. */
export const PLACEHOLDER_JWT_SECRETS: readonly string[] = [
  'replace-with-a-random-secret-of-at-least-32-bytes',
];
export const PLACEHOLDER_DB_PASSWORDS: readonly string[] = ['change-me'];
