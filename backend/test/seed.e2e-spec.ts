import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { compare } from 'bcryptjs';
import { Pool } from 'pg';
import { FixedClock } from '../src/common/clock';
import { runMigrations } from '../src/database/migrate';
import {
  AUDITOR_EMAIL,
  AUDITOR_FULLNAME,
  DEMO_EMAIL,
  DEMO_FULLNAME,
  DEMO_USER_ID,
} from '../src/database/seed/seed.constants';
import { runSeed } from '../src/database/seed/seed';
import type { RunSeedOptions } from '../src/database/seed/seed.types';
import { startTestDatabase } from './utils/test-app';
import type { TestDatabase } from './utils/test.types';

const execFileAsync = promisify(execFile);
const PASSWORD = 'demo-password-for-e2e-only';
const CLOCK = new FixedClock('2026-09-30T02:00:00Z');

const options = (
  databaseUrl: string,
  extra: Partial<RunSeedOptions> = {},
): RunSeedOptions => ({
  databaseUrl,
  demoPassword: PASSWORD,
  bcryptCost: 4,
  businessTimezone: 'UTC',
  resetPasswords: false,
  clock: CLOCK,
  ...extra,
});

describe('seed (e2e)', () => {
  let database: TestDatabase;
  let pool: Pool;

  const count = async (table: string): Promise<number> =>
    Number(
      (await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))
        .rows[0].n,
    );

  beforeAll(async () => {
    database = await startTestDatabase();
    pool = new Pool({ connectionString: database.url });
  });

  afterAll(async () => {
    await pool.end();
    await database.stop();
  });

  it('creates 2 users, the Appendix A invoice and 40 generated invoices', async () => {
    const result = await runSeed(options(database.url));

    expect(result).toMatchObject({
      businessDate: '2026-09-30',
      usersCreated: 2,
      passwordsReset: 0,
      invoicesInserted: 41,
      invoicesSkipped: 0,
      persisted: { Draft: 10, Pending: 19, Paid: 12 },
    });
    expect(result.effective.Paid).toBeGreaterThanOrEqual(4);
    expect(result.effective.Draft).toBeGreaterThanOrEqual(4);
    expect(result.effective.Pending).toBeGreaterThanOrEqual(4);
    expect(result.effective.Overdue).toBeGreaterThanOrEqual(4);
    expect(Object.values(result.effective).reduce((a, b) => a + b, 0)).toBe(41);

    expect(await count('users')).toBe(2);
    expect(await count('invoices')).toBe(41);
    expect(await count('invoice_items')).toBe(41);
  });

  it('stores the demo users with hashed passwords and the fixed demo id', async () => {
    const { rows } = await pool.query<{
      id: string;
      email: string;
      role: string;
      fullname: string;
      password_hash: string;
    }>(
      'SELECT id, email, role, fullname, password_hash FROM users ORDER BY email',
    );

    expect(rows.map((r) => [r.email, r.role, r.fullname])).toEqual([
      [AUDITOR_EMAIL, 'AUDITOR', AUDITOR_FULLNAME],
      [DEMO_EMAIL, 'ACCOUNTANT', DEMO_FULLNAME],
    ]);
    expect(rows.find((r) => r.email === DEMO_EMAIL)?.id).toBe(DEMO_USER_ID);
    for (const row of rows) {
      expect(row.password_hash).not.toContain(PASSWORD);
      await expect(compare(PASSWORD, row.password_hash)).resolves.toBe(true);
    }
  });

  it('stores the Appendix A invoice as Pending with derived Overdue on the run date', async () => {
    const { rows } = await pool.query(
      `SELECT invoice_number, status, total_amount::text AS total, total_paid::text AS paid,
              balance_amount::text AS balance, created_by, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS created_at
         FROM invoices WHERE id = '099ca7da-a290-40fa-93b9-1c43ae7bb887'`,
    );
    expect(rows).toEqual([
      {
        invoice_number: 'IV1780488206995',
        status: 'Pending',
        total: '2180.0000',
        paid: '1451.3400',
        balance: '728.6600',
        created_by: DEMO_USER_ID,
        created_at: '2026-06-03T12:03:26.995',
      },
    ]);
  });

  it('never stores Overdue and keeps every constraint valid', async () => {
    const invalid = await pool.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'invoices'::regclass AND NOT convalidated`,
    );
    expect(invalid.rows).toEqual([]);

    const statuses = await pool.query<{ status: string }>(
      'SELECT DISTINCT status FROM invoices ORDER BY 1',
    );
    expect(statuses.rows.map((r) => r.status)).toEqual([
      'Draft',
      'Paid',
      'Pending',
    ]);

    const orphans = await pool.query(
      `SELECT i.id FROM invoices i LEFT JOIN invoice_items x ON x.invoice_id = i.id
        GROUP BY i.id HAVING count(x.id) <> 1`,
    );
    expect(orphans.rows).toEqual([]);
  });

  it('supports the search demos (shared name parts, odd casing)', async () => {
    const acme = await pool.query(
      `SELECT DISTINCT customer_fullname FROM invoices WHERE customer_fullname ILIKE '%acme%'`,
    );
    expect(acme.rows.length).toBeGreaterThanOrEqual(3);
    const odd = await pool.query(
      `SELECT invoice_number FROM invoices WHERE invoice_number ~ '^[a-z]'`,
    );
    expect(odd.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent: a second run inserts nothing and changes nothing', async () => {
    const before = await pool.query(
      'SELECT id, invoice_number, invoice_date, due_date, total_amount FROM invoices ORDER BY id',
    );

    const result = await runSeed(options(database.url));

    expect(result).toMatchObject({
      usersCreated: 0,
      invoicesInserted: 0,
      invoicesSkipped: 41,
    });
    expect(await count('users')).toBe(2);
    expect(await count('invoices')).toBe(41);
    expect(await count('invoice_items')).toBe(41);
    const after = await pool.query(
      'SELECT id, invoice_number, invoice_date, due_date, total_amount FROM invoices ORDER BY id',
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('does not overwrite passwords or lockouts unless resetPasswords is set', async () => {
    await pool.query(
      `UPDATE users SET failed_login_count = 4, locked_until = now() + interval '1 hour' WHERE email = $1`,
      [DEMO_EMAIL],
    );
    const other = 'another-password-15-chars';

    await runSeed(options(database.url, { demoPassword: other }));
    let row = (
      await pool.query<{ password_hash: string; failed_login_count: number }>(
        'SELECT password_hash, failed_login_count FROM users WHERE email = $1',
        [DEMO_EMAIL],
      )
    ).rows[0];
    await expect(compare(PASSWORD, row.password_hash)).resolves.toBe(true);
    expect(row.failed_login_count).toBe(4);

    const result = await runSeed(
      options(database.url, { demoPassword: other, resetPasswords: true }),
    );
    expect(result.passwordsReset).toBe(2);
    row = (
      await pool.query<{ password_hash: string; failed_login_count: number }>(
        'SELECT password_hash, failed_login_count FROM users WHERE email = $1',
        [DEMO_EMAIL],
      )
    ).rows[0];
    await expect(compare(other, row.password_hash)).resolves.toBe(true);
    expect(row.failed_login_count).toBe(0);
    expect(await count('invoices')).toBe(41);
  });

  it('rolls everything back and explains when the demo email has another id', async () => {
    await pool.query('CREATE DATABASE seed_conflict');
    const url = new URL(database.url);
    url.pathname = '/seed_conflict';
    await runMigrations(url.toString());
    const other = new Pool({ connectionString: url.toString() });
    try {
      await other.query(
        `INSERT INTO users (id, email, password_hash, fullname, role)
         VALUES ('00000000-0000-4000-8000-000000000001', $1, 'x', 'Someone Else', 'ACCOUNTANT')`,
        [DEMO_EMAIL],
      );

      await expect(runSeed(options(url.toString()))).rejects.toThrow(
        /other than the Appendix A id/,
      );

      const counts = await other.query<{ users: string; invoices: string }>(
        `SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM invoices) AS invoices`,
      );
      expect(counts.rows[0]).toEqual({ users: '1', invoices: '0' });
    } finally {
      await other.end();
    }
  });

  describe('command line entry point', () => {
    const tsx = resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
    const script = resolve(__dirname, '../src/database/seed/seed.ts');
    const run = (env: Record<string, string>) =>
      execFileAsync(process.execPath, [tsx, script], {
        cwd: resolve(__dirname, '..'),
        env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', ...env },
      });

    it('runs against the database, prints a summary and never prints the password', async () => {
      const { stdout, stderr } = await run({
        DATABASE_URL: database.url,
        SEED_DEMO_PASSWORD: PASSWORD,
        BCRYPT_COST: '4',
      });
      expect(stdout).toContain('Seed complete');
      expect(stdout).toContain('persisted status: Draft=10 Pending=19 Paid=12');
      expect(stdout).toContain('effective status:');
      expect(stdout + stderr).not.toContain(PASSWORD);
      expect(await count('invoices')).toBe(41);
    });

    it('exits 1 naming the key when the password is missing', async () => {
      const failure = await run({ DATABASE_URL: database.url }).then(
        () => null,
        (error: { code: number; stderr: string }) => error,
      );
      expect(failure?.code).toBe(1);
      expect(failure?.stderr).toContain('SEED_DEMO_PASSWORD');
    });
  });
});
