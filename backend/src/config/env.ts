import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  BCRYPT_COST_DEFAULT,
  BCRYPT_COST_MAX,
  BCRYPT_COST_MIN,
  BOOLEAN_ENV_VALUES,
  DEFAULT_BUSINESS_TIMEZONE,
  LOG_LEVELS,
  MIN_SEED_PASSWORD_LENGTH,
  NODE_ENVS,
  PLACEHOLDER_DB_PASSWORDS,
  PLACEHOLDER_JWT_SECRETS,
} from './config.constants';
import type { AppConfig, EnvIssue, FileReader } from './config.types';

/**
 * Thrown when the environment is invalid. It lists offending keys and reasons
 * only, never the values, so secrets cannot leak into logs.
 */
export class EnvValidationError extends Error {
  constructor(readonly issues: EnvIssue[]) {
    super(
      `Invalid environment configuration:\n${issues
        .map((i) => `  - ${i.key}: ${i.message}`)
        .join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

const defaultAllowedOrigins = 'http://localhost:8080,http://localhost:5173';

const boolFromString = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(BOOLEAN_ENV_VALUES))
  .transform((v) => v === 'true' || v === '1');

const intInRange = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max);

const isValidTimeZone = (value: string): boolean => {
  if (/^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const originList = z.string().transform((value, ctx) => {
  const origins: string[] = [];
  for (const raw of value.split(',')) {
    const item = raw.trim();
    if (item === '') continue;
    try {
      const url = new URL(item);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('protocol');
      }
      origins.push(url.origin);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'must be a comma separated list of http(s) origins',
      });
      return z.NEVER;
    }
  }
  return origins;
});

const baseSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: intInRange(1, 65535).default(3000),
  DATABASE_URL: z
    .string()
    .refine((v) => /^postgres(ql)?:\/\/.+/.test(v), {
      message: 'must be a postgresql:// connection URL',
    })
    .optional(),
  DB_HOST: z.string().min(1).optional(),
  DB_PORT: intInRange(1, 65535).default(5432),
  DB_USER: z.string().min(1).optional(),
  DB_PASSWORD: z.string().min(1).optional(),
  DB_NAME: z.string().min(1).optional(),
  JWT_SECRET: z
    .string()
    .refine((v) => Buffer.byteLength(v, 'utf8') >= 32, {
      message: 'must be at least 32 bytes (UTF-8)',
    })
    .optional(),
  JWT_ACCESS_TTL_SECONDS: intInRange(60, 86400).default(3600),
  JWT_ISSUER: z.string().min(1).default('simple-invoice-api'),
  JWT_AUDIENCE: z.string().min(1).default('simple-invoice-web'),
  REFRESH_TOKEN_TTL_SECONDS: intInRange(60, 31_536_000).default(86400),
  REFRESH_FAMILY_TTL_SECONDS: intInRange(60, 31_536_000).default(604800),
  REFRESH_COOKIE_PATH: z
    .string()
    .refine((v) => v.startsWith('/'), { message: 'must start with "/"' })
    .default('/api/auth'),
  REFRESH_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_.-]{1,64}$/, {
      message: 'must be 1-64 chars of letters, digits, "_", "." or "-"',
    })
    .default('si_rt'),
  COOKIE_SECURE: boolFromString.default(true),
  ALLOWED_ORIGINS: originList.prefault(defaultAllowedOrigins),
  CORS_ORIGINS: originList.default([]),
  BCRYPT_COST: intInRange(BCRYPT_COST_MIN, BCRYPT_COST_MAX).default(
    BCRYPT_COST_DEFAULT,
  ),
  LOGIN_MAX_FAILED_ATTEMPTS: intInRange(1, 100).default(5),
  LOGIN_LOCKOUT_MAX_SECONDS: intInRange(1, 86400).default(900),
  THROTTLE_LOGIN_LIMIT: intInRange(1, 1_000_000).default(10),
  THROTTLE_REFRESH_LIMIT: intInRange(1, 1_000_000).default(30),
  THROTTLE_GLOBAL_LIMIT: intInRange(1, 1_000_000).default(120),
  IDEMPOTENCY_TTL_SECONDS: intInRange(60, 2_592_000).default(86400),
  BUSINESS_TIMEZONE: z
    .string()
    .refine(isValidTimeZone, { message: 'must be a valid IANA time zone' })
    .default(DEFAULT_BUSINESS_TIMEZONE),
  SWAGGER_ENABLED: boolFromString.default(true),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  SEED_DEMO_PASSWORD: z
    .string()
    .min(MIN_SEED_PASSWORD_LENGTH, {
      message: `must be at least ${MIN_SEED_PASSWORD_LENGTH} characters`,
    })
    .optional(),
  SEED_ON_START: boolFromString.default(false),
});

const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.REFRESH_FAMILY_TTL_SECONDS < env.REFRESH_TOKEN_TTL_SECONDS) {
    ctx.addIssue({
      code: 'custom',
      path: ['REFRESH_FAMILY_TTL_SECONDS'],
      message: 'must be >= REFRESH_TOKEN_TTL_SECONDS',
    });
  }
});

const defaultReader: FileReader = (path) => readFileSync(path, 'utf8');

/** Drops variables that are set to an empty string (compose does this often). */
function normalize(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

/**
 * Resolves a secret given directly or through a `*_FILE` variable. Files are
 * trimmed because generated secrets usually end with a newline.
 */
function resolveSecret(
  env: Record<string, string>,
  key: string,
  read: FileReader,
  issues: EnvIssue[],
): string | undefined {
  const fileKey = `${key}_FILE`;
  const direct = env[key];
  const filePath = env[fileKey];
  if (direct !== undefined && filePath !== undefined) {
    issues.push({ key, message: `set either ${key} or ${fileKey}, not both` });
    return undefined;
  }
  if (filePath === undefined) return direct;
  try {
    const content = read(filePath).trim();
    if (content === '') {
      issues.push({ key: fileKey, message: 'file is empty' });
      return undefined;
    }
    return content;
  } catch {
    issues.push({ key: fileKey, message: 'file cannot be read' });
    return undefined;
  }
}

function missingDatabaseParts(
  env: { DB_HOST?: string; DB_USER?: string; DB_NAME?: string },
  hasPassword: boolean,
): string[] {
  const missing: string[] = [];
  if (env.DB_HOST === undefined) missing.push('DB_HOST');
  if (env.DB_USER === undefined) missing.push('DB_USER');
  if (env.DB_NAME === undefined) missing.push('DB_NAME');
  if (!hasPassword) missing.push('DB_PASSWORD or DB_PASSWORD_FILE');
  return missing;
}

function databaseIssue(missing: string[]): EnvIssue {
  return {
    key: 'DATABASE_URL',
    message: `required, or provide all of DB_HOST, DB_USER, DB_PASSWORD (or DB_PASSWORD_FILE), DB_NAME (missing: ${missing.join(', ')})`,
  };
}

function buildDatabaseUrl(
  env: z.infer<typeof baseSchema>,
  hasPassword: boolean,
  issues: EnvIssue[],
): string | undefined {
  if (env.DATABASE_URL !== undefined) return env.DATABASE_URL;
  const missing = missingDatabaseParts(env, hasPassword);
  if (missing.length > 0) {
    issues.push(databaseIssue(missing));
    return undefined;
  }
  const url = new URL('postgresql://placeholder');
  url.hostname = env.DB_HOST as string;
  url.port = String(env.DB_PORT);
  url.username = env.DB_USER as string;
  url.password = env.DB_PASSWORD as string;
  url.pathname = `/${env.DB_NAME as string}`;
  return url.toString();
}

function passwordOf(databaseUrl: string): string | undefined {
  try {
    return decodeURIComponent(new URL(databaseUrl).password);
  } catch {
    return undefined;
  }
}

/**
 * The example file is public, so a secret copied from it is a known key. The
 * messages name the key only, never the value.
 */
function productionPlaceholderIssues(
  jwtSecret: string | undefined,
  databaseUrl: string | undefined,
): EnvIssue[] {
  const issues: EnvIssue[] = [];
  if (jwtSecret !== undefined && PLACEHOLDER_JWT_SECRETS.includes(jwtSecret)) {
    issues.push({
      key: 'JWT_SECRET',
      message:
        'is the public placeholder from .env.example; generate a random secret',
    });
  }
  const dbPassword =
    databaseUrl === undefined ? undefined : passwordOf(databaseUrl);
  if (
    dbPassword !== undefined &&
    PLACEHOLDER_DB_PASSWORDS.includes(dbPassword)
  ) {
    issues.push({
      key: 'DB_PASSWORD',
      message:
        'is the public placeholder from .env.example; set a real database password (also when it comes from DATABASE_URL)',
    });
  }
  return issues;
}

function collectZodIssues(error: z.ZodError): EnvIssue[] {
  return error.issues.map((issue) => ({
    key: issue.path.length > 0 ? issue.path.join('.') : 'env',
    message: issue.message,
  }));
}

/**
 * Validates an environment and returns the typed configuration. Throws
 * EnvValidationError listing every invalid key (values are never included).
 */
export function parseEnv(
  source: NodeJS.ProcessEnv,
  readFile: FileReader = defaultReader,
): AppConfig {
  const env = normalize(source);
  const issues: EnvIssue[] = [];

  const jwtSecret = resolveSecret(env, 'JWT_SECRET', readFile, issues);
  const dbPassword = resolveSecret(env, 'DB_PASSWORD', readFile, issues);
  const resolved: Record<string, string> = { ...env };
  delete resolved.JWT_SECRET;
  delete resolved.DB_PASSWORD;
  if (jwtSecret !== undefined) resolved.JWT_SECRET = jwtSecret;
  if (dbPassword !== undefined) resolved.DB_PASSWORD = dbPassword;

  const parsed = envSchema.safeParse(resolved);
  if (!parsed.success) {
    issues.push(...collectZodIssues(parsed.error));
    // Report a missing database configuration in the same pass.
    const missing = missingDatabaseParts(resolved, dbPassword !== undefined);
    if (
      resolved.DATABASE_URL === undefined &&
      missing.length > 0 &&
      !issues.some((i) => i.key === 'DATABASE_URL')
    ) {
      issues.push(databaseIssue(missing));
    }
  }

  if (
    jwtSecret === undefined &&
    !issues.some((i) => i.key.startsWith('JWT_SECRET'))
  ) {
    issues.push({
      key: 'JWT_SECRET',
      message: 'required (or set JWT_SECRET_FILE)',
    });
  }

  if (!parsed.success) throw new EnvValidationError(issues);
  const data = parsed.data;

  const databaseUrl = buildDatabaseUrl(data, dbPassword !== undefined, issues);
  if (data.NODE_ENV === 'production') {
    issues.push(...productionPlaceholderIssues(jwtSecret, databaseUrl));
  }
  if (
    issues.length > 0 ||
    databaseUrl === undefined ||
    jwtSecret === undefined
  ) {
    throw new EnvValidationError(issues);
  }

  return {
    nodeEnv: data.NODE_ENV,
    port: data.PORT,
    databaseUrl,
    jwtSecret,
    jwtAccessTtlSeconds: data.JWT_ACCESS_TTL_SECONDS,
    jwtIssuer: data.JWT_ISSUER,
    jwtAudience: data.JWT_AUDIENCE,
    refreshTokenTtlSeconds: data.REFRESH_TOKEN_TTL_SECONDS,
    refreshFamilyTtlSeconds: data.REFRESH_FAMILY_TTL_SECONDS,
    refreshCookiePath: data.REFRESH_COOKIE_PATH,
    refreshCookieName: data.REFRESH_COOKIE_NAME,
    cookieSecure: data.COOKIE_SECURE,
    allowedOrigins: data.ALLOWED_ORIGINS,
    corsOrigins: data.CORS_ORIGINS,
    bcryptCost: data.BCRYPT_COST,
    loginMaxFailedAttempts: data.LOGIN_MAX_FAILED_ATTEMPTS,
    loginLockoutMaxSeconds: data.LOGIN_LOCKOUT_MAX_SECONDS,
    throttleLoginLimit: data.THROTTLE_LOGIN_LIMIT,
    throttleRefreshLimit: data.THROTTLE_REFRESH_LIMIT,
    throttleGlobalLimit: data.THROTTLE_GLOBAL_LIMIT,
    idempotencyTtlSeconds: data.IDEMPOTENCY_TTL_SECONDS,
    businessTimezone: data.BUSINESS_TIMEZONE,
    swaggerEnabled: data.SWAGGER_ENABLED,
    logLevel: data.LOG_LEVEL,
    seedDemoPassword: data.SEED_DEMO_PASSWORD,
    seedOnStart: data.SEED_ON_START,
  };
}

/**
 * Database-only subset used by the migration runner and drizzle-kit, which
 * must not require JWT settings. Same DATABASE_URL / DB_* rules as parseEnv.
 */
export function parseDatabaseUrl(
  source: NodeJS.ProcessEnv,
  readFile: FileReader = defaultReader,
): string {
  const env = normalize(source);
  const issues: EnvIssue[] = [];
  const dbPassword = resolveSecret(env, 'DB_PASSWORD', readFile, issues);
  const resolved: Record<string, string> = { ...env };
  delete resolved.DB_PASSWORD;
  if (dbPassword !== undefined) resolved.DB_PASSWORD = dbPassword;

  const parsed = baseSchema
    .pick({
      DATABASE_URL: true,
      DB_HOST: true,
      DB_PORT: true,
      DB_USER: true,
      DB_PASSWORD: true,
      DB_NAME: true,
    })
    .safeParse(resolved);
  if (!parsed.success) {
    throw new EnvValidationError([
      ...issues,
      ...collectZodIssues(parsed.error),
    ]);
  }
  const url = buildDatabaseUrl(
    parsed.data as z.infer<typeof baseSchema>,
    dbPassword !== undefined,
    issues,
  );
  if (issues.length > 0 || url === undefined)
    throw new EnvValidationError(issues);
  return url;
}
