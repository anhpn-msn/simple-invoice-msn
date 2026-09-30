import { EnvValidationError } from '../config/env';
import { parseRuntimeRoleEnv } from './runtime-role-env';

const OWNER_URL = 'postgresql://owner:owner-secret@db:5432/app';
const PASSWORD = 'runtime-password-0123456789abcdef';

const base = {
  DATABASE_URL: OWNER_URL,
  APP_DB_USER: 'simple_invoice_app',
  APP_DB_PASSWORD: PASSWORD,
};

function issuesOf(
  env: NodeJS.ProcessEnv,
  readFile?: (path: string) => string,
): string[] {
  try {
    parseRuntimeRoleEnv(env, readFile);
  } catch (error) {
    if (error instanceof EnvValidationError)
      return error.issues.map((i) => i.key);
    throw error;
  }
  return [];
}

describe('parseRuntimeRoleEnv', () => {
  it('is skipped when no runtime role variable is set (local single-user dev)', () => {
    expect(parseRuntimeRoleEnv({ DATABASE_URL: OWNER_URL })).toBeUndefined();
    expect(
      parseRuntimeRoleEnv({ DATABASE_URL: OWNER_URL, APP_DB_USER: '' }),
    ).toBeUndefined();
  });

  it('returns the owner connection, role and password', () => {
    expect(parseRuntimeRoleEnv(base)).toEqual({
      ownerDatabaseUrl: OWNER_URL,
      roleName: 'simple_invoice_app',
      password: PASSWORD,
    });
  });

  it('builds the owner connection from DB_* parts and reads both password files', () => {
    const files: Record<string, string> = {
      '/run/owner': 'owner-file-secret\n',
      '/run/app': `${PASSWORD}\n`,
    };
    const config = parseRuntimeRoleEnv(
      {
        DB_HOST: 'db',
        DB_USER: 'simple_invoice',
        DB_NAME: 'simple_invoice',
        DB_PASSWORD_FILE: '/run/owner',
        APP_DB_USER: 'simple_invoice_app',
        APP_DB_PASSWORD_FILE: '/run/app',
      },
      (path) => files[path],
    );
    expect(config).toEqual({
      ownerDatabaseUrl:
        'postgresql://simple_invoice:owner-file-secret@db:5432/simple_invoice',
      roleName: 'simple_invoice_app',
      password: PASSWORD,
    });
  });

  it.each([
    'Simple_Invoice',
    '1app',
    'app-role',
    'app"; DROP TABLE users; --',
    'a'.repeat(64),
    'pg_app',
  ])('rejects the role name %j', (name) => {
    expect(issuesOf({ ...base, APP_DB_USER: name })).toEqual(['APP_DB_USER']);
  });

  it('accepts the longest valid role name', () => {
    expect(issuesOf({ ...base, APP_DB_USER: `_${'a'.repeat(62)}` })).toEqual(
      [],
    );
  });

  it('rejects a role name equal to the owner user', () => {
    expect(issuesOf({ ...base, APP_DB_USER: 'owner' })).toEqual([
      'APP_DB_USER',
    ]);
  });

  it('requires the role name when a password is configured', () => {
    expect(
      issuesOf({ DATABASE_URL: OWNER_URL, APP_DB_PASSWORD: PASSWORD }),
    ).toEqual(['APP_DB_USER']);
  });

  it('requires exactly one password source', () => {
    expect(
      issuesOf({ DATABASE_URL: OWNER_URL, APP_DB_USER: 'simple_invoice_app' }),
    ).toEqual(['APP_DB_PASSWORD']);
    expect(
      issuesOf({ ...base, APP_DB_PASSWORD_FILE: '/run/app' }, () => PASSWORD),
    ).toEqual(['APP_DB_PASSWORD']);
  });

  it('reports unreadable or empty password files', () => {
    const env = {
      DATABASE_URL: OWNER_URL,
      APP_DB_USER: 'simple_invoice_app',
      APP_DB_PASSWORD_FILE: '/run/app',
    };
    expect(
      issuesOf(env, () => {
        throw new Error('EACCES');
      }),
    ).toEqual(['APP_DB_PASSWORD_FILE']);
    expect(issuesOf(env, () => ' \n')).toEqual(['APP_DB_PASSWORD_FILE']);
  });

  it.each([
    ['too short', 'x'.repeat(15)],
    ['too long', 'x'.repeat(129)],
    ['with a space', 'runtime password 0123456789'],
    ['non-ASCII', 'runtime-pässword-0123456789'],
  ])('rejects a password that is %s', (_label, password) => {
    expect(issuesOf({ ...base, APP_DB_PASSWORD: password })).toEqual([
      'APP_DB_PASSWORD',
    ]);
  });

  it('requires the owner connection', () => {
    expect(
      issuesOf({
        APP_DB_USER: 'simple_invoice_app',
        APP_DB_PASSWORD: PASSWORD,
      }),
    ).toEqual(['DATABASE_URL']);
  });

  it('never puts a password in the error text', () => {
    const shortPassword = 'short-secret';
    let message = '';
    try {
      parseRuntimeRoleEnv({ ...base, APP_DB_PASSWORD: shortPassword });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toMatch(/APP_DB_PASSWORD/);
    expect(message).not.toContain(shortPassword);
    expect(message).not.toContain('owner-secret');
  });
});
