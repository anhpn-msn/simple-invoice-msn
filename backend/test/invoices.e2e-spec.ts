import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { CLOCK, FixedClock } from '../src/common/clock';
import { createTestApp } from './utils/test-app';
import type { ErrorBody, TestApp, LoginResult } from './utils/test.types';
import { createUser, login } from './utils/auth';
import type { Role } from '../src/common/auth/permissions';
import {
  HTTP_HEADERS,
  IDEMPOTENT_REPLAYED_TRUE,
  headerKey,
} from '../src/common/http/http-headers.constants';
import { BEARER_SCHEME } from '../src/auth/auth.constants';
import { MS_PER_SECOND } from '../src/common/clock/clock.constants';
import type { OpenAPIObject } from '@nestjs/swagger';
import type {
  InvoiceDetailDto,
  InvoiceListResponseDto,
} from '../src/invoices/dto/invoice-response.dto';
import { bodyOf } from './utils/http';

const detailBody = (res: { body: unknown }): InvoiceDetailDto =>
  bodyOf<InvoiceDetailDto>(res);
const listBody = (res: { body: unknown }): InvoiceListResponseDto =>
  bodyOf<InvoiceListResponseDto>(res);

// loginAs() forwards the whole created user (with its id) to /auth/login, which
// forbids unknown fields, so log in with explicit credentials instead.
async function signIn(t: TestApp, role: Role): Promise<LoginResult> {
  const { email, password } = await createUser(t, { role });
  return login(t, { email, password });
}

const NOW = '2026-09-30T05:00:00.000Z';
const TODAY = '2026-09-30';
const IDEMPOTENCY_TTL_SECONDS = 60;

describe('Invoices (e2e)', () => {
  let t: TestApp;
  let clock: FixedClock;
  let accountant: LoginResult;
  let otherAccountant: LoginResult;
  let auditor: LoginResult;
  const run = randomUUID().slice(0, 8);
  let counter = 0;

  const nextNumber = (): string => {
    counter += 1;
    return `E2E-${run}-${counter}`;
  };

  const invoiceBody = (
    patch: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    invoiceNumber: nextNumber(),
    invoiceDate: '2026-09-01',
    dueDate: '2026-10-01',
    currency: 'AUD',
    customer: { fullname: `Customer ${run}`, email: 'customer@example.test' },
    items: [{ name: 'Honda RC150', quantity: 2, rate: '1000.00' }],
    ...patch,
  });

  const create = (
    who: LoginResult,
    body: Record<string, unknown>,
    key?: string,
  ) => {
    const req = t
      .http()
      .post('/invoices')
      .set(HTTP_HEADERS.AUTHORIZATION, `${BEARER_SCHEME} ${who.accessToken}`);
    if (key !== undefined) req.set(HTTP_HEADERS.IDEMPOTENCY_KEY, key);
    return req.send(body);
  };

  const list = (
    who: LoginResult,
    query: Record<string, string | number> = {},
  ) =>
    t
      .http()
      .get('/invoices')
      .set(HTTP_HEADERS.AUTHORIZATION, `${BEARER_SCHEME} ${who.accessToken}`)
      .query(query);

  const countInvoices = async (invoiceNumber: string): Promise<number> => {
    const result = await t.db.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM invoices WHERE lower(invoice_number) = lower(${invoiceNumber})`,
    );
    return Number(result.rows[0].n);
  };

  const auditCount = async (invoiceNumber: string): Promise<number> => {
    const result = await t.db.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM audit_events WHERE action = 'INVOICE_CREATED' AND metadata->>'invoiceNumber' = ${invoiceNumber}`,
    );
    return Number(result.rows[0].n);
  };

  beforeAll(async () => {
    clock = new FixedClock(NOW);
    t = await createTestApp({
      env: { IDEMPOTENCY_TTL_SECONDS: String(IDEMPOTENCY_TTL_SECONDS) },
      overrideProviders: [{ token: CLOCK, useValue: clock }],
    });
    accountant = await signIn(t, 'ACCOUNTANT');
    otherAccountant = await signIn(t, 'ACCOUNTANT');
    auditor = await signIn(t, 'AUDITOR');
  });

  afterAll(() => t.close());

  describe('authentication and authorization', () => {
    it('rejects every route without a token (401)', async () => {
      await t.http().get('/invoices').expect(401);
      await t.http().get(`/invoices/${randomUUID()}`).expect(401);
      await t.http().post('/invoices').send(invoiceBody()).expect(401);
    });

    it('rejects a garbage bearer token (401)', async () => {
      await t
        .http()
        .get('/invoices')
        .set(HTTP_HEADERS.AUTHORIZATION, `${BEARER_SCHEME} not-a-jwt`)
        .expect(401);
    });

    it('lets an auditor read but not create (403 with the standard error shape)', async () => {
      await list(auditor).expect(200);
      const body = invoiceBody();
      const res = await create(auditor, body).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403, error: 'Forbidden' });
      expect(await countInvoices(body.invoiceNumber as string)).toBe(0);
    });
  });

  describe('POST /invoices', () => {
    it('creates a Draft with server-computed totals and a Location header', async () => {
      const body = invoiceBody({ taxRate: '10', discount: '20' });
      const res = await create(accountant, body).expect(201);

      expect(res.headers[headerKey(HTTP_HEADERS.LOCATION)]).toBe(
        `/invoices/${detailBody(res).invoiceId}`,
      );
      expect(
        res.headers[headerKey(HTTP_HEADERS.IDEMPOTENT_REPLAYED)],
      ).toBeUndefined();
      expect(res.body).toMatchObject({
        invoiceNumber: body.invoiceNumber,
        status: 'Draft',
        currency: 'AUD',
        currencySymbol: 'AU$',
        taxRate: '10.00',
        invoiceSubTotal: '2000.00',
        totalTax: '200.00',
        totalDiscount: '20.00',
        totalAmount: '2180.00',
        totalPaid: '0.00',
        balanceAmount: '2180.00',
        createdBy: accountant.user.id,
        customer: {
          fullname: `Customer ${run}`,
          email: 'customer@example.test',
          mobileNumber: null,
          address: null,
        },
        items: [{ name: 'Honda RC150', quantity: 2, rate: '1000.00' }],
      });
      expect(detailBody(res).invoiceReference).toBeNull();
      expect(detailBody(res).description).toBeNull();
    });

    it('defaults tax to 10% and discount to 0', async () => {
      const res = await create(accountant, invoiceBody()).expect(201);
      expect(res.body).toMatchObject({
        taxRate: '10.00',
        totalTax: '200.00',
        totalDiscount: '0.00',
        totalAmount: '2200.00',
      });
    });

    it('calculates exactly with fractional cents and rounds half up once at the end', async () => {
      const res = await create(
        accountant,
        invoiceBody({
          items: [{ name: 'x', quantity: 3, rate: '0.1000' }],
          taxRate: '7.5',
        }),
      ).expect(201);
      expect(res.body).toMatchObject({
        invoiceSubTotal: '0.30',
        totalTax: '0.02',
        totalAmount: '0.32',
      });
      expect(detailBody(res).items[0].rate).toBe('0.10');
    });

    it('formats JPY without decimals', async () => {
      const res = await create(
        accountant,
        invoiceBody({
          currency: 'JPY',
          items: [{ name: 'x', quantity: 1, rate: '1000' }],
        }),
      ).expect(201);
      expect(res.body).toMatchObject({
        currency: 'JPY',
        currencySymbol: '¥',
        invoiceSubTotal: '1000',
        totalTax: '100',
        totalAmount: '1100',
        balanceAmount: '1100',
      });
    });

    it('stores the same invoice that GET /invoices/:id returns', async () => {
      const created = await create(
        accountant,
        invoiceBody({ description: 'Notes', invoiceReference: '#77' }),
      ).expect(201);
      const detail = await t
        .http()
        .get(`/invoices/${detailBody(created).invoiceId}`)
        .set(
          HTTP_HEADERS.AUTHORIZATION,
          `${BEARER_SCHEME} ${auditor.accessToken}`,
        )
        .expect(200);
      expect(detail.body).toEqual(created.body);
    });

    it.each([
      ['a client supplied status', { status: 'Paid' }],
      ['a client supplied totalAmount', { totalAmount: '1.00' }],
      ['a client supplied createdBy', { createdBy: randomUUID() }],
      ['a client supplied balanceAmount', { balanceAmount: '0.00' }],
      ['an unknown field', { surprise: true }],
    ])('rejects %s with 400 and stores nothing', async (_label, extra) => {
      const body = invoiceBody(extra);
      const res = await create(accountant, body).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      expect(await countInvoices(body.invoiceNumber as string)).toBe(0);
    });

    it('rejects a due date before the invoice date with a clear message', async () => {
      const res = await create(
        accountant,
        invoiceBody({ invoiceDate: '2026-09-10', dueDate: '2026-09-09' }),
      ).expect(400);
      expect(bodyOf<ErrorBody>(res).message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('dueDate must be on or after invoiceDate'),
        ]),
      );
    });

    it('rejects a discount larger than subtotal plus tax with 400', async () => {
      const res = await create(
        accountant,
        invoiceBody({
          items: [{ name: 'x', quantity: 1, rate: '1.00' }],
          discount: '500.00',
        }),
      ).expect(400);
      expect(bodyOf<ErrorBody>(res).statusCode).toBe(400);
    });

    it.each([
      [
        'float money as a JSON number',
        { items: [{ name: 'x', quantity: 1, rate: 10.5 }] },
      ],
      ['zero quantity', { items: [{ name: 'x', quantity: 0, rate: '1.00' }] }],
      [
        'two line items',
        {
          items: [
            { name: 'a', quantity: 1, rate: '1.00' },
            { name: 'b', quantity: 1, rate: '1.00' },
          ],
        },
      ],
      ['an unsupported currency', { currency: 'XXX' }],
      [
        'an invalid email',
        { customer: { fullname: 'P', email: 'not-an-email' } },
      ],
      ['an impossible date', { invoiceDate: '2026-02-30' }],
    ])('rejects %s with 400', async (_label, patch) => {
      await create(accountant, invoiceBody(patch)).expect(400);
    });

    it('rejects a duplicate invoice number in a different case with 409 and no partial rows', async () => {
      const body = invoiceBody({ invoiceNumber: `Dup-${run}-A` });
      await create(accountant, body).expect(201);

      const res = await create(otherAccountant, {
        ...body,
        invoiceNumber: `DUP-${run}-a`,
      }).expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        message: 'Invoice number already exists',
        error: 'Conflict',
      });
      expect(await countInvoices(`dup-${run}-a`)).toBe(1);
      expect(await auditCount(`DUP-${run}-a`)).toBe(0);
    });

    it('lets exactly one of two concurrent requests with the same number win', async () => {
      const number = nextNumber();
      const results = await Promise.all([
        create(accountant, invoiceBody({ invoiceNumber: number })),
        create(otherAccountant, invoiceBody({ invoiceNumber: number })),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await countInvoices(number)).toBe(1);
    });

    it('writes an INVOICE_CREATED audit row without personal data', async () => {
      const body = invoiceBody();
      const res = await create(accountant, body).expect(201);
      const rows = await t.db.execute<{
        actor_user_id: string;
        entity_id: string;
        metadata: Record<string, unknown>;
      }>(
        sql`SELECT actor_user_id, entity_id, metadata FROM audit_events WHERE action = 'INVOICE_CREATED' AND entity_id = ${detailBody(res).invoiceId}`,
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].actor_user_id).toBe(accountant.user.id);
      expect(rows.rows[0].metadata).toEqual({
        invoiceNumber: body.invoiceNumber,
        totalAmount: '2200.00',
        currency: 'AUD',
      });
    });

    it('is not vulnerable to SQL injection through text fields', async () => {
      const evil = "Robert'); DROP TABLE invoices;--";
      const res = await create(
        accountant,
        invoiceBody({ customer: { fullname: evil, email: 'e@example.test' } }),
      ).expect(201);
      expect(detailBody(res).customer.fullname).toBe(evil);
      await list(accountant, { keyword: evil }).expect(200);
    });
  });

  describe('Idempotency-Key', () => {
    it('replays the first response for the same key and body, creating one invoice', async () => {
      const body = invoiceBody();
      const key = randomUUID();

      const first = await create(accountant, body, key).expect(201);
      const second = await create(accountant, { ...body }, key).expect(201);

      expect(second.body).toEqual(first.body);
      expect(second.headers[headerKey(HTTP_HEADERS.IDEMPOTENT_REPLAYED)]).toBe(
        IDEMPOTENT_REPLAYED_TRUE,
      );
      expect(second.headers.location).toBe(first.headers.location);
      expect(
        first.headers[headerKey(HTTP_HEADERS.IDEMPOTENT_REPLAYED)],
      ).toBeUndefined();
      expect(await countInvoices(body.invoiceNumber as string)).toBe(1);
      expect(await auditCount(body.invoiceNumber as string)).toBe(1);
    });

    it('treats reordered JSON keys as the same request', async () => {
      const body = invoiceBody();
      const key = randomUUID();
      await create(accountant, body, key).expect(201);
      const reordered = Object.fromEntries(Object.entries(body).reverse());
      const replay = await create(accountant, reordered, key).expect(201);
      expect(replay.headers[headerKey(HTTP_HEADERS.IDEMPOTENT_REPLAYED)]).toBe(
        IDEMPOTENT_REPLAYED_TRUE,
      );
    });

    it('answers 422 when the key is reused with a different body', async () => {
      const key = randomUUID();
      const body = invoiceBody();
      await create(accountant, body, key).expect(201);

      const other = invoiceBody();
      const res = await create(accountant, other, key).expect(422);

      expect(res.body).toMatchObject({
        statusCode: 422,
        error: 'Unprocessable Entity',
      });
      expect(await countInvoices(other.invoiceNumber as string)).toBe(0);
    });

    it('creates exactly one invoice for many concurrent requests with the same key', async () => {
      const body = invoiceBody();
      const key = randomUUID();

      const results = await Promise.all(
        Array.from({ length: 8 }, () => create(accountant, body, key)),
      );

      expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
      expect(new Set(results.map((r) => detailBody(r).invoiceId)).size).toBe(1);
      expect(
        results.filter(
          (r) =>
            r.headers[headerKey(HTTP_HEADERS.IDEMPOTENT_REPLAYED)] ===
            IDEMPOTENT_REPLAYED_TRUE,
        ),
      ).toHaveLength(7);
      expect(await countInvoices(body.invoiceNumber as string)).toBe(1);
      expect(await auditCount(body.invoiceNumber as string)).toBe(1);
    });

    it('does not consume the key when the request fails validation', async () => {
      const key = randomUUID();
      const bad = invoiceBody({ dueDate: '2026-08-01' });
      await create(accountant, bad, key).expect(400);

      const fixed = { ...bad, dueDate: '2026-10-01' };
      const res = await create(accountant, fixed, key).expect(201);
      expect(
        res.headers[headerKey(HTTP_HEADERS.IDEMPOTENT_REPLAYED)],
      ).toBeUndefined();
    });

    it('releases the key when the create fails on a duplicate number', async () => {
      const taken = invoiceBody();
      await create(accountant, taken).expect(201);
      const key = randomUUID();
      await create(accountant, taken, key).expect(409);

      const retry = await create(accountant, invoiceBody(), key).expect(201);
      expect(
        retry.headers[headerKey(HTTP_HEADERS.IDEMPOTENT_REPLAYED)],
      ).toBeUndefined();
    });

    it('scopes keys per user', async () => {
      const key = randomUUID();
      const a = invoiceBody();
      const b = invoiceBody();
      const first = await create(accountant, a, key).expect(201);
      const second = await create(otherAccountant, b, key).expect(201);
      expect(
        second.headers[headerKey(HTTP_HEADERS.IDEMPOTENT_REPLAYED)],
      ).toBeUndefined();
      expect(detailBody(second).invoiceId).not.toBe(
        detailBody(first).invoiceId,
      );
    });

    it('reclaims an expired key instead of replaying or failing', async () => {
      const key = randomUUID();
      const first = await create(accountant, invoiceBody(), key).expect(201);
      try {
        clock.set(
          new Date(
            new Date(NOW).getTime() +
              (IDEMPOTENCY_TTL_SECONDS + 1) * MS_PER_SECOND,
          ),
        );
        const second = await create(accountant, invoiceBody(), key).expect(201);
        expect(
          second.headers[headerKey(HTTP_HEADERS.IDEMPOTENT_REPLAYED)],
        ).toBeUndefined();
        expect(detailBody(second).invoiceId).not.toBe(
          detailBody(first).invoiceId,
        );
      } finally {
        clock.set(NOW);
      }
    });

    it.each([
      ['empty', ''],
      ['with a space', 'two words'],
      ['too long', 'K'.repeat(256)],
      ['non-ASCII', 'clé'],
    ])('rejects a key that is %s with 400', async (_label, key) => {
      const body = invoiceBody();
      await create(accountant, body, key).expect(400);
      expect(await countInvoices(body.invoiceNumber as string)).toBe(0);
    });

    it('accepts a 255 character key', async () => {
      await create(accountant, invoiceBody(), 'K'.repeat(255)).expect(201);
    });

    it('does not let an auditor claim keys or replay responses (403 before any key work)', async () => {
      const key = randomUUID();
      const body = invoiceBody();
      await create(accountant, body, key).expect(201);
      await create(auditor, body, key).expect(403);
    });
  });

  describe('GET /invoices/:id', () => {
    it('returns 404 for an unknown id with the standard error shape', async () => {
      const res = await t
        .http()
        .get(`/invoices/${randomUUID()}`)
        .set(
          HTTP_HEADERS.AUTHORIZATION,
          `${BEARER_SCHEME} ${accountant.accessToken}`,
        )
        .expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
    });

    it('returns 400 for a malformed id', async () => {
      await t
        .http()
        .get('/invoices/not-a-uuid')
        .set(
          HTTP_HEADERS.AUTHORIZATION,
          `${BEARER_SCHEME} ${accountant.accessToken}`,
        )
        .expect(400);
    });

    it('does not leak internals in a bad id probe', async () => {
      const res = await t
        .http()
        .get("/invoices/1'%20OR%20'1'='1")
        .set(
          HTTP_HEADERS.AUTHORIZATION,
          `${BEARER_SCHEME} ${accountant.accessToken}`,
        )
        .expect(400);
      expect(JSON.stringify(res.body)).not.toMatch(/select|sql|pg|drizzle/i);
    });
  });

  describe('GET /invoices', () => {
    const scoped = (name: string): string => `${name} ${run}`;

    const seed = async (
      name: string,
      patch: Record<string, unknown> = {},
    ): Promise<{ id: string; number: string }> => {
      const body = invoiceBody({
        customer: { fullname: scoped(name), email: 'c@example.test' },
        ...patch,
      });
      const res = await create(accountant, body).expect(201);
      return {
        id: detailBody(res).invoiceId,
        number: body.invoiceNumber as string,
      };
    };

    // A Paid row must be fully settled (check constraint invoices_paid_is_settled).
    const setStatus = (id: string, status: string) =>
      status === 'Paid'
        ? t.db.execute(
            sql`UPDATE invoices SET status = 'Paid', total_paid = total_amount, balance_amount = 0 WHERE id = ${id}`,
          )
        : t.db.execute(
            sql`UPDATE invoices SET status = ${status} WHERE id = ${id}`,
          );

    it('returns the SPEC shape with paging metadata and defaults', async () => {
      const made = await seed('Shape');
      const res = await list(auditor, { keyword: made.number }).expect(200);
      expect(listBody(res).paging).toEqual({ page: 1, pageSize: 10, total: 1 });
      expect(listBody(res).data).toEqual([
        {
          invoiceId: made.id,
          invoiceNumber: made.number,
          customerName: scoped('Shape'),
          invoiceDate: '2026-09-01',
          dueDate: '2026-10-01',
          currency: 'AUD',
          currencySymbol: 'AU$',
          totalAmount: '2200.00',
          balanceAmount: '2200.00',
          status: 'Draft',
        },
      ]);
    });

    it('searches invoice number and customer name, case-insensitive and partial', async () => {
      const made = await seed('Zephyr Holdings');
      const byName = await list(accountant, { keyword: `zEPHyr hold` }).expect(
        200,
      );
      expect(
        listBody(byName).data.map((d: { invoiceId: string }) => d.invoiceId),
      ).toContain(made.id);
      const byNumber = await list(accountant, {
        keyword: made.number.toLowerCase(),
      }).expect(200);
      expect(listBody(byNumber).data).toHaveLength(1);
      const byPart = await list(accountant, {
        keyword: made.number.slice(4, 14),
      }).expect(200);
      expect(
        listBody(byPart).data.map((d: { invoiceId: string }) => d.invoiceId),
      ).toContain(made.id);
    });

    it('finds a freshly created invoice by keyword (the assessment workflow)', async () => {
      const made = await seed('Workflow');
      const res = await list(accountant, { keyword: made.number }).expect(200);
      expect(listBody(res).data[0].invoiceId).toBe(made.id);
    });

    it('treats % _ and backslash in the keyword literally', async () => {
      const percent = await seed(`Fifty%Off`);
      const underscore = await seed(`Under_Score`);
      const slash = await seed(`Back\\Slash`);
      const decoys = [
        await seed('FiftyXOff'),
        await seed('UnderXScore'),
        await seed('BackXSlash'),
      ];

      const ids = async (keyword: string): Promise<string[]> =>
        listBody(await list(accountant, { keyword }).expect(200)).data.map(
          (d) => d.invoiceId,
        );

      expect(await ids(`Fifty%Off ${run}`)).toEqual([percent.id]);
      expect(await ids(`Under_Score ${run}`)).toEqual([underscore.id]);
      expect(await ids(`Back\\Slash ${run}`)).toEqual([slash.id]);
      expect(await ids('%')).not.toContain(decoys[0].id);
      const all = await ids(`${run}`);
      expect(all).toEqual(expect.arrayContaining(decoys.map((d) => d.id)));
    });

    it('rejects a blank keyword with 400', async () => {
      await list(accountant, { keyword: '   ' }).expect(400);
    });

    it('keeps the status filter consistent with the derived status shown in each row', async () => {
      const overdueDraft = await seed('Status', {
        invoiceDate: '2026-09-01',
        dueDate: '2026-09-29',
      });
      const draftDueToday = await seed('Status', {
        invoiceDate: '2026-09-01',
        dueDate: TODAY,
      });
      const overduePending = await seed('Status', {
        invoiceDate: '2026-09-01',
        dueDate: '2026-09-29',
      });
      const pending = await seed('Status', {
        invoiceDate: '2026-09-01',
        dueDate: '2026-10-15',
      });
      const paid = await seed('Status', {
        invoiceDate: '2026-01-01',
        dueDate: '2026-01-31',
      });
      await setStatus(overduePending.id, 'Pending');
      await setStatus(pending.id, 'Pending');
      await setStatus(paid.id, 'Paid');

      const idsFor = async (status: string): Promise<string[]> => {
        const res = await list(accountant, {
          keyword: scoped('Status'),
          status,
        }).expect(200);
        for (const row of listBody(res).data) expect(row.status).toBe(status);
        return listBody(res)
          .data.map((d: { invoiceId: string }) => d.invoiceId)
          .sort();
      };

      expect(await idsFor('Overdue')).toEqual(
        [overdueDraft.id, overduePending.id].sort(),
      );
      expect(await idsFor('Draft')).toEqual([draftDueToday.id]);
      expect(await idsFor('Pending')).toEqual([pending.id]);
      expect(await idsFor('Paid')).toEqual([paid.id]);

      const everything = await list(accountant, {
        keyword: scoped('Status'),
        pageSize: 100,
      }).expect(200);
      expect(listBody(everything).paging.total).toBe(5);
    });

    it('follows the business date from the injected clock', async () => {
      const made = await seed('Clock', {
        invoiceDate: '2026-09-01',
        dueDate: '2026-10-01',
      });
      const overdueOn = async (who: LoginResult): Promise<string[]> =>
        listBody(
          await list(who, {
            keyword: scoped('Clock'),
            status: 'Overdue',
          }).expect(200),
        ).data.map((d) => d.invoiceId);
      expect(await overdueOn(accountant)).toEqual([]);
      try {
        clock.set('2026-10-02T05:00:00.000Z');
        // Access tokens are verified against the same clock, so sign in again.
        expect(await overdueOn(await signIn(t, 'ACCOUNTANT'))).toEqual([
          made.id,
        ]);
      } finally {
        clock.set(NOW);
      }
    });

    it('filters by invoice date range inclusively', async () => {
      const early = await seed('Range', {
        invoiceDate: '2026-03-01',
        dueDate: '2026-04-01',
      });
      const mid = await seed('Range', {
        invoiceDate: '2026-03-15',
        dueDate: '2026-04-15',
      });
      const late = await seed('Range', {
        invoiceDate: '2026-03-31',
        dueDate: '2026-04-30',
      });

      const idsIn = async (query: Record<string, string>) =>
        listBody(
          await list(accountant, { keyword: scoped('Range'), ...query }).expect(
            200,
          ),
        )
          .data.map((d) => d.invoiceId)
          .sort();

      expect(
        await idsIn({ fromDate: '2026-03-01', toDate: '2026-03-31' }),
      ).toEqual([early.id, mid.id, late.id].sort());
      expect(
        await idsIn({ fromDate: '2026-03-02', toDate: '2026-03-30' }),
      ).toEqual([mid.id]);
      expect(await idsIn({ fromDate: '2026-03-31' })).toEqual([late.id]);
      expect(await idsIn({ toDate: '2026-03-01' })).toEqual([early.id]);
    });

    it('rejects an inverted or malformed date range with 400', async () => {
      await list(accountant, {
        fromDate: '2026-04-01',
        toDate: '2026-03-01',
      }).expect(400);
      await list(accountant, { fromDate: '2026-13-01' }).expect(400);
      await list(accountant, { fromDate: 'yesterday' }).expect(400);
    });

    it('sorts by amount in both directions with a stable page order', async () => {
      const rates = ['10.00', '30.00', '20.00', '20.00'];
      for (const rate of rates) {
        await seed('Sort', { items: [{ name: 'x', quantity: 1, rate }] });
      }
      const amounts = async (ordering: string): Promise<string[]> =>
        listBody(
          await list(accountant, {
            keyword: scoped('Sort'),
            sortBy: 'totalAmount',
            ordering,
          }).expect(200),
        ).data.map((d) => d.totalAmount);
      expect(await amounts('ASC')).toEqual([
        '11.00',
        '22.00',
        '22.00',
        '33.00',
      ]);
      expect(await amounts('DESC')).toEqual([
        '33.00',
        '22.00',
        '22.00',
        '11.00',
      ]);

      const seen = new Set<string>();
      for (const page of [1, 2]) {
        const res = await list(accountant, {
          keyword: scoped('Sort'),
          sortBy: 'totalAmount',
          ordering: 'ASC',
          pageSize: 2,
          page,
        }).expect(200);
        for (const row of listBody(res).data) seen.add(row.invoiceId);
      }
      expect(seen.size).toBe(4);
    });

    it('sorts numerically, not as text (9 before 10)', async () => {
      await seed('Numeric', {
        items: [{ name: 'x', quantity: 1, rate: '9.00' }],
      });
      await seed('Numeric', {
        items: [{ name: 'x', quantity: 1, rate: '100.00' }],
      });
      const res = await list(accountant, {
        keyword: scoped('Numeric'),
        sortBy: 'totalAmount',
        ordering: 'ASC',
      }).expect(200);
      expect(
        listBody(res).data.map((d: { totalAmount: string }) => d.totalAmount),
      ).toEqual(['9.90', '110.00']);
    });

    it('sorts by invoice date and due date', async () => {
      const a = await seed('DateSort', {
        invoiceDate: '2026-02-01',
        dueDate: '2026-06-01',
      });
      const b = await seed('DateSort', {
        invoiceDate: '2026-03-01',
        dueDate: '2026-05-01',
      });
      const idsBy = async (
        sortBy: string,
        ordering: string,
      ): Promise<string[]> =>
        listBody(
          await list(accountant, {
            keyword: scoped('DateSort'),
            sortBy,
            ordering,
          }).expect(200),
        ).data.map((d) => d.invoiceId);
      expect(await idsBy('invoiceDate', 'ASC')).toEqual([a.id, b.id]);
      expect(await idsBy('invoiceDate', 'DESC')).toEqual([b.id, a.id]);
      expect(await idsBy('dueDate', 'ASC')).toEqual([b.id, a.id]);
    });

    it('accepts ordering in any case', async () => {
      await list(accountant, { ordering: 'asc' }).expect(200);
    });

    it('pages with the real total, including a page past the end', async () => {
      for (let i = 0; i < 5; i += 1) await seed('Paging');

      const page2 = await list(accountant, {
        keyword: scoped('Paging'),
        pageSize: 2,
        page: 2,
      }).expect(200);
      expect(listBody(page2).data).toHaveLength(2);
      expect(listBody(page2).paging).toEqual({
        page: 2,
        pageSize: 2,
        total: 5,
      });

      const page3 = await list(accountant, {
        keyword: scoped('Paging'),
        pageSize: 2,
        page: 3,
      }).expect(200);
      expect(listBody(page3).data).toHaveLength(1);

      const beyond = await list(accountant, {
        keyword: scoped('Paging'),
        pageSize: 2,
        page: 50,
      }).expect(200);
      expect(listBody(beyond).data).toEqual([]);
      expect(listBody(beyond).paging).toEqual({
        page: 50,
        pageSize: 2,
        total: 5,
      });
    });

    it.each([
      ['pageSize above 100', { pageSize: 101 }],
      ['pageSize zero', { pageSize: 0 }],
      ['page zero', { page: 0 }],
      ['a fractional page', { page: 1.5 }],
      ['a non-numeric page', { page: 'abc' }],
      [
        'an unknown sort column',
        { sortBy: 'customerEmail; DROP TABLE invoices' },
      ],
      ['an unknown ordering', { ordering: 'sideways' }],
      ['an unknown status', { status: 'Void' }],
      ['an unknown query parameter', { unknown: 'x' }],
    ])('rejects %s with 400', async (_label, query) => {
      const res = await list(
        accountant,
        query as Record<string, string | number>,
      ).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
    });

    it('accepts pageSize 100', async () => {
      await list(accountant, { pageSize: 100 }).expect(200);
    });
  });

  describe('Swagger', () => {
    it('documents the invoice endpoints and the Idempotency-Key header', async () => {
      const res = await t.http().get('/api/docs-json').expect(200);
      const doc = bodyOf<OpenAPIObject>(res);
      const post = doc.paths['/invoices'].post;
      expect(post?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: HTTP_HEADERS.IDEMPOTENCY_KEY,
            in: 'header',
            required: false,
          }),
        ]),
      );
      expect(Object.keys(post?.responses ?? {})).toEqual(
        expect.arrayContaining(['201', '400', '401', '403', '409', '422']),
      );
      expect(doc.paths['/invoices/{id}'].get).toBeDefined();
    });
  });
});
