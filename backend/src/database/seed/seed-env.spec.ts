import { EnvValidationError } from '../../config/env';
import { parseSeedEnv } from './seed-env';

const base = {
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/db',
  SEED_DEMO_PASSWORD: 'a-long-enough-demo-pw',
};

function issuesOf(env: NodeJS.ProcessEnv): string[] {
  try {
    parseSeedEnv(env);
  } catch (error) {
    if (error instanceof EnvValidationError)
      return error.issues.map((i) => i.key);
    throw error;
  }
  return [];
}

describe('parseSeedEnv', () => {
  it('applies defaults', () => {
    expect(parseSeedEnv(base)).toEqual({
      databaseUrl: base.DATABASE_URL,
      demoPassword: base.SEED_DEMO_PASSWORD,
      bcryptCost: 12,
      businessTimezone: 'UTC',
      resetPasswords: false,
    });
  });

  it('fails clearly when the password is missing, empty or short', () => {
    expect(issuesOf({ DATABASE_URL: base.DATABASE_URL })).toEqual([
      'SEED_DEMO_PASSWORD',
    ]);
    expect(issuesOf({ ...base, SEED_DEMO_PASSWORD: '' })).toEqual([
      'SEED_DEMO_PASSWORD',
    ]);
    expect(issuesOf({ ...base, SEED_DEMO_PASSWORD: 'x'.repeat(14) })).toEqual([
      'SEED_DEMO_PASSWORD',
    ]);
    expect(issuesOf({ ...base, SEED_DEMO_PASSWORD: 'x'.repeat(15) })).toEqual(
      [],
    );
  });

  it('rejects a password longer than 72 bytes', () => {
    expect(issuesOf({ ...base, SEED_DEMO_PASSWORD: 'x'.repeat(73) })).toEqual([
      'SEED_DEMO_PASSWORD',
    ]);
    expect(issuesOf({ ...base, SEED_DEMO_PASSWORD: 'x'.repeat(72) })).toEqual(
      [],
    );
  });

  it('never puts the password in the error text', () => {
    const password = 'short-secret';
    expect(() =>
      parseSeedEnv({ ...base, SEED_DEMO_PASSWORD: password }),
    ).toThrow(/SEED_DEMO_PASSWORD/);
    expect(() =>
      parseSeedEnv({ ...base, SEED_DEMO_PASSWORD: password }),
    ).not.toThrow(new RegExp(password));
  });

  it('requires a database', () => {
    expect(issuesOf({ SEED_DEMO_PASSWORD: base.SEED_DEMO_PASSWORD })).toContain(
      'DATABASE_URL',
    );
  });

  it('validates cost, time zone and reset flag', () => {
    expect(issuesOf({ ...base, BCRYPT_COST: '3' })).toEqual(['BCRYPT_COST']);
    expect(issuesOf({ ...base, BUSINESS_TIMEZONE: 'Mars/Base' })).toEqual([
      'BUSINESS_TIMEZONE',
    ]);
    expect(issuesOf({ ...base, SEED_RESET_PASSWORDS: 'maybe' })).toEqual([
      'SEED_RESET_PASSWORDS',
    ]);
    expect(
      parseSeedEnv({ ...base, SEED_RESET_PASSWORDS: 'true' }).resetPasswords,
    ).toBe(true);
    expect(
      parseSeedEnv({ ...base, BUSINESS_TIMEZONE: 'Asia/Singapore' })
        .businessTimezone,
    ).toBe('Asia/Singapore');
  });
});
