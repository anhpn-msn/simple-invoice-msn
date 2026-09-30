import { EnvValidationError, parseDatabaseUrl } from '../../config/env';
import {
  BCRYPT_COST_DEFAULT,
  BCRYPT_COST_MAX,
  BCRYPT_COST_MIN,
  BOOLEAN_ENV_VALUES,
  DEFAULT_BUSINESS_TIMEZONE,
  MAX_PASSWORD_BYTES,
  MIN_SEED_PASSWORD_LENGTH,
} from '../../config/config.constants';
import type { EnvIssue } from '../../config/config.types';
import { toBusinessDate } from '../../common/clock';
import type { SeedConfig } from './seed.types';

/**
 * Reads the seed settings from the environment. The seed needs only a small
 * part of the API configuration (no JWT secret), so it validates its own keys.
 * Error messages name keys and rules, never values.
 */
export function parseSeedEnv(source: NodeJS.ProcessEnv): SeedConfig {
  const issues: EnvIssue[] = [];
  const read = (key: string): string | undefined => {
    const value = source[key];
    return value === undefined || value === '' ? undefined : value;
  };

  let databaseUrl = '';
  try {
    databaseUrl = parseDatabaseUrl(source);
  } catch (error) {
    if (!(error instanceof EnvValidationError)) throw error;
    issues.push(...error.issues);
  }

  const demoPassword = read('SEED_DEMO_PASSWORD');
  if (demoPassword === undefined) {
    issues.push({
      key: 'SEED_DEMO_PASSWORD',
      message: `required, at least ${MIN_SEED_PASSWORD_LENGTH} characters`,
    });
  } else if (demoPassword.length < MIN_SEED_PASSWORD_LENGTH) {
    issues.push({
      key: 'SEED_DEMO_PASSWORD',
      message: `must be at least ${MIN_SEED_PASSWORD_LENGTH} characters`,
    });
  } else if (Buffer.byteLength(demoPassword, 'utf8') > MAX_PASSWORD_BYTES) {
    issues.push({
      key: 'SEED_DEMO_PASSWORD',
      message: `must be at most ${MAX_PASSWORD_BYTES} bytes (bcrypt limit)`,
    });
  }

  const bcryptCost = Number(read('BCRYPT_COST') ?? BCRYPT_COST_DEFAULT);
  if (
    !Number.isInteger(bcryptCost) ||
    bcryptCost < BCRYPT_COST_MIN ||
    bcryptCost > BCRYPT_COST_MAX
  ) {
    issues.push({
      key: 'BCRYPT_COST',
      message: `must be an integer from ${BCRYPT_COST_MIN} to ${BCRYPT_COST_MAX}`,
    });
  }

  const businessTimezone =
    read('BUSINESS_TIMEZONE') ?? DEFAULT_BUSINESS_TIMEZONE;
  try {
    toBusinessDate(new Date(0), businessTimezone);
  } catch {
    issues.push({
      key: 'BUSINESS_TIMEZONE',
      message: 'must be a valid IANA time zone',
    });
  }

  const rawReset = (read('SEED_RESET_PASSWORDS') ?? 'false')
    .trim()
    .toLowerCase();
  if (!(BOOLEAN_ENV_VALUES as readonly string[]).includes(rawReset)) {
    issues.push({
      key: 'SEED_RESET_PASSWORDS',
      message: 'must be true or false',
    });
  }

  if (issues.length > 0 || demoPassword === undefined)
    throw new EnvValidationError(issues);

  return {
    databaseUrl,
    demoPassword,
    bcryptCost,
    businessTimezone,
    resetPasswords: rawReset === 'true' || rawReset === '1',
  };
}
