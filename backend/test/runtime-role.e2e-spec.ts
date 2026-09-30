import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { BEARER_SCHEME } from '../src/auth/auth.constants';
import { HTTP_HEADERS } from '../src/common/http/http-headers.constants';
import { applyRuntimeRole } from '../src/database/runtime-role';
import { runSeed } from '../src/database/seed/seed';
import type { InvoiceListResponseDto } from '../src/invoices/dto/invoice-response.dto';
import { DEMO_EMAIL } from '../src/database/seed/seed.constants';
import { login } from './utils/auth';
import { bodyOf } from './utils/http';
import { createTestApp, startTestDatabase } from './utils/test-app';
import type { TestApp, TestDatabase } from './utils/test.types';

const ROLE = 'simple_invoice_app';
const PERMISSION_DENIED = '42501';

const EXPECTED_GRANTS = [
  { table: 'audit_events', privileges: ['SELECT', 'INSERT'] },
  { table: 'idempotency_keys', privileges: ['SELECT', 'INSERT', 'UPDATE'] },
  { table: 'invoice_items', privileges: ['SELECT', 'INSERT'] },
  { table: 'invoices', privileges: ['SELECT', 'INSERT'] },
  { table: 'refresh_tokens', privileges: ['SELECT', 'INSERT', 'UPDATE'] },
  { table: 'users', privileges: ['SELECT', 'INSERT', 'UPDATE'] },
];

function withUser(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}

describe('runtime database role (e2e)', () => {
  let database: TestDatabase;
  let owner: Pool;
  let app: Pool;
  let appUrl: string;
  const password = randomBytes(24).toString('hex');

  const expectDenied = async (statement: string): Promise<void> => {
    await expect(app.query(statement)).rejects.toMatchObject({
      code: PERMISSION_DENIED,
    });
  };

  beforeAll(async () => {
    database = await startTestDatabase();
    owner = new Pool({ connectionString: database.url, max: 1 });
    await applyRuntimeRole(database.url, ROLE, password);
    appUrl = withUser(database.url, ROLE, password);
    app = new Pool({ connectionString: appUrl, max: 1 });
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await database?.stop();
  });

  it('is a plain login role that stores only a SCRAM verifier', async () => {
    const { rows } = await owner.query<Record<string, unknown>>(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication,
              rolbypassrls, rolcanlogin, left(rolpassword, 14) AS scheme
       FROM pg_authid WHERE rolname = $1`,
      [ROLE],
    );
    expect(rows).toEqual([
      {
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolreplication: false,
        rolbypassrls: false,
        rolcanlogin: true,
        scheme: 'SCRAM-SHA-256$',
      },
    ]);
  });

  it('holds exactly the listed table privileges', async () => {
    await expect(
      applyRuntimeRole(database.url, ROLE, password),
    ).resolves.toEqual(EXPECTED_GRANTS);
  });

  it('can append audit events but never change or remove them', async () => {
    await app.query(
      `INSERT INTO audit_events (action, outcome) VALUES ('ACCESS_DENIED', 'FAILURE')`,
    );
    await expectDenied(`UPDATE audit_events SET action = 'X'`);
    await expectDenied('DELETE FROM audit_events');
    await expectDenied('TRUNCATE audit_events');
    await expectDenied(
      'ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update_delete',
    );
    await expectDenied('ALTER TABLE audit_events DISABLE TRIGGER ALL');
    await expectDenied(
      'DROP TRIGGER audit_events_no_update_delete ON audit_events',
    );
  });

  it('cannot change the schema, its money invariants or other roles', async () => {
    await expectDenied(
      'ALTER TABLE invoices DROP CONSTRAINT invoices_total_formula',
    );
    await expectDenied(`UPDATE invoices SET total_paid = 0`);
    await expectDenied('DELETE FROM users');
    await expectDenied('CREATE TABLE public.t19_probe (id int)');
    await expectDenied('CREATE TEMP TABLE t19_probe (id int)');
    await expectDenied('SELECT * FROM drizzle.__drizzle_migrations');
    await expectDenied(`COPY (SELECT 1) TO PROGRAM 'id'`);
    const ownerName = new URL(database.url).username;
    await expectDenied(`SET ROLE ${ownerName}`);
  });

  it('revokes rights added by hand when it runs again', async () => {
    await owner.query(
      `GRANT DELETE, TRUNCATE ON audit_events TO ${ROLE}; GRANT pg_write_all_data TO ${ROLE}; GRANT CREATE ON SCHEMA public TO ${ROLE}`,
    );
    await expect(
      applyRuntimeRole(database.url, ROLE, password),
    ).resolves.toEqual(EXPECTED_GRANTS);
    const { rows } = await owner.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_auth_members WHERE member = $1::regrole`,
      [ROLE],
    );
    expect(rows[0].n).toBe('0');
    await expectDenied('DELETE FROM audit_events');
    await expectDenied('CREATE TABLE public.t19_probe (id int)');
  });

  it('refuses a role that owns objects', async () => {
    const other = 't19_owner_probe';
    await owner.query(
      `CREATE ROLE ${other}; CREATE TABLE public.${other}_table (id int); ALTER TABLE public.${other}_table OWNER TO ${other}`,
    );
    await expect(
      applyRuntimeRole(database.url, other, password),
    ).rejects.toThrow(/must own nothing/);
  });

  describe('the API running as the runtime role', () => {
    let t: TestApp;
    const demoPassword = randomBytes(18).toString('base64url');

    beforeAll(async () => {
      await runSeed({
        databaseUrl: appUrl,
        demoPassword,
        bcryptCost: 4,
        businessTimezone: 'UTC',
        resetPasswords: true,
      });
      t = await createTestApp({
        database: { url: appUrl, stop: () => Promise.resolve() },
      });
    });

    afterAll(() => t?.close());

    it('logs in, creates and lists invoices, and writes audit rows', async () => {
      const session = await login(t, {
        email: DEMO_EMAIL,
        password: demoPassword,
      });
      const auth = `${BEARER_SCHEME} ${session.accessToken}`;
      const invoiceNumber = `T19-${randomUUID().slice(0, 8)}`;

      await t
        .http()
        .post('/invoices')
        .set(HTTP_HEADERS.AUTHORIZATION, auth)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, randomUUID())
        .send({
          invoiceNumber,
          invoiceDate: '2026-09-01',
          dueDate: '2026-10-01',
          currency: 'AUD',
          customer: { fullname: 'Runtime Role', email: 'role@example.test' },
          items: [{ name: 'Probe', quantity: 1, rate: '10.00' }],
        })
        .expect(201);

      const listed = await t
        .http()
        .get('/invoices')
        .query({ keyword: invoiceNumber })
        .set(HTTP_HEADERS.AUTHORIZATION, auth)
        .expect(200);
      expect(
        bodyOf<InvoiceListResponseDto>(listed).data.map(
          (row) => row.invoiceNumber,
        ),
      ).toEqual([invoiceNumber]);

      const { rows } = await owner.query<{ action: string }>(
        `SELECT DISTINCT action FROM audit_events WHERE action IN ('LOGIN_SUCCEEDED', 'INVOICE_CREATED') ORDER BY action`,
      );
      expect(rows.map((r) => r.action)).toEqual([
        'INVOICE_CREATED',
        'LOGIN_SUCCEEDED',
      ]);
    });
  });
});
