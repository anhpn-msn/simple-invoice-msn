import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { EnvValidationError, parseDatabaseUrl } from '../config/env';
import type { EnvIssue, FileReader } from '../config/config.types';
import {
  RESERVED_ROLE_PREFIX,
  RUNTIME_ROLE_NAME_PATTERN,
  RUNTIME_ROLE_PASSWORD_PATTERN,
} from './runtime-role.constants';
import type { RuntimeRoleConfig } from './runtime-role.types';

const roleNameSchema = z
  .string()
  .regex(RUNTIME_ROLE_NAME_PATTERN, {
    message:
      'must be 1-63 characters of lowercase letters, digits or "_", not starting with a digit',
  })
  .refine((value) => !value.startsWith(RESERVED_ROLE_PREFIX), {
    message: `must not start with "${RESERVED_ROLE_PREFIX}" (reserved by PostgreSQL)`,
  });

const passwordSchema = z.string().regex(RUNTIME_ROLE_PASSWORD_PATTERN, {
  message: 'must be 16-128 printable ASCII characters without spaces',
});

const defaultReader: FileReader = (path) => readFileSync(path, 'utf8');

function read(source: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = source[key];
  return value === undefined || value === '' ? undefined : value;
}

/** Zod messages carry the rule only, so they are safe to show; the value never is. */
function check(
  schema: z.ZodType<string>,
  key: string,
  value: string,
  issues: EnvIssue[],
): void {
  const result = schema.safeParse(value);
  if (!result.success) {
    issues.push(
      ...result.error.issues.map((i) => ({ key, message: i.message })),
    );
  }
}

function resolvePassword(
  source: NodeJS.ProcessEnv,
  readFile: FileReader,
  issues: EnvIssue[],
): string | undefined {
  const direct = read(source, 'APP_DB_PASSWORD');
  const filePath = read(source, 'APP_DB_PASSWORD_FILE');
  if (direct !== undefined && filePath !== undefined) {
    issues.push({
      key: 'APP_DB_PASSWORD',
      message: 'set either APP_DB_PASSWORD or APP_DB_PASSWORD_FILE, not both',
    });
    return undefined;
  }
  if (filePath === undefined) {
    if (direct === undefined) {
      issues.push({
        key: 'APP_DB_PASSWORD',
        message: 'required (or set APP_DB_PASSWORD_FILE)',
      });
    }
    return direct;
  }
  try {
    const content = readFile(filePath).trim();
    if (content !== '') return content;
    issues.push({ key: 'APP_DB_PASSWORD_FILE', message: 'file is empty' });
  } catch {
    issues.push({
      key: 'APP_DB_PASSWORD_FILE',
      message: 'file cannot be read',
    });
  }
  return undefined;
}

/**
 * Reads the runtime role settings. Returns undefined when none of APP_DB_USER,
 * APP_DB_PASSWORD, APP_DB_PASSWORD_FILE is set: local development then keeps
 * using the single user from `.env`. The owner connection follows the same
 * DATABASE_URL / DB_* rules as the migration runner. Error messages name keys
 * and rules, never values.
 */
export function parseRuntimeRoleEnv(
  source: NodeJS.ProcessEnv,
  readFile: FileReader = defaultReader,
): RuntimeRoleConfig | undefined {
  const roleName = read(source, 'APP_DB_USER');
  const passwordConfigured =
    read(source, 'APP_DB_PASSWORD') !== undefined ||
    read(source, 'APP_DB_PASSWORD_FILE') !== undefined;
  if (roleName === undefined && !passwordConfigured) return undefined;

  const issues: EnvIssue[] = [];
  if (roleName === undefined) {
    issues.push({
      key: 'APP_DB_USER',
      message: 'required when APP_DB_PASSWORD or APP_DB_PASSWORD_FILE is set',
    });
  } else {
    check(roleNameSchema, 'APP_DB_USER', roleName, issues);
  }

  const password = resolvePassword(source, readFile, issues);
  if (password !== undefined) {
    check(passwordSchema, 'APP_DB_PASSWORD', password, issues);
  }

  let ownerDatabaseUrl: string | undefined;
  try {
    ownerDatabaseUrl = parseDatabaseUrl(source, readFile);
  } catch (error) {
    if (!(error instanceof EnvValidationError)) throw error;
    issues.push(...error.issues);
  }

  if (
    roleName !== undefined &&
    ownerDatabaseUrl !== undefined &&
    decodeURIComponent(new URL(ownerDatabaseUrl).username) === roleName
  ) {
    issues.push({
      key: 'APP_DB_USER',
      message: 'must differ from the owner user (DB_USER or DATABASE_URL)',
    });
  }

  if (
    issues.length > 0 ||
    roleName === undefined ||
    password === undefined ||
    ownerDatabaseUrl === undefined
  ) {
    throw new EnvValidationError(issues);
  }
  return { ownerDatabaseUrl, roleName, password };
}
