import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
  buildListOrderBy,
  buildListWhere,
  buildScopeCondition,
  escapeLike,
} from './invoice-list-query';

const dialect = new PgDialect();
const render = (fragment: SQL | undefined) => {
  if (!fragment) return undefined;
  const { sql: text, params } = dialect.sqlToQuery(fragment);
  return { text, params };
};

const TODAY = '2026-09-30';

describe('escapeLike', () => {
  it.each([
    ['plain', 'plain'],
    ['50%', '50\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ['%_\\', '\\%\\_\\\\'],
    ["o'brien", "o'brien"],
  ])('escapes %j to %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});

describe('buildListWhere', () => {
  it('has no condition without filters', () => {
    expect(buildListWhere({ today: TODAY }, {})).toBeUndefined();
  });

  it('searches both columns with ILIKE, an explicit ESCAPE and a bound, escaped pattern', () => {
    const where = render(
      buildListWhere({ keyword: '50%_a\\b', today: TODAY }, {}),
    );
    expect(where?.text).toBe(
      `("invoices"."invoice_number" ILIKE $1 ESCAPE '\\' or "invoices"."customer_fullname" ILIKE $2 ESCAPE '\\')`,
    );
    expect(where?.params).toEqual(['%50\\%\\_a\\\\b%', '%50\\%\\_a\\\\b%']);
  });

  it('never inlines the keyword into the SQL text', () => {
    const where = render(
      buildListWhere(
        { keyword: "'; DROP TABLE invoices; --", today: TODAY },
        {},
      ),
    );
    expect(where?.text).not.toMatch(/DROP/i);
    expect(where?.params[0]).toBe("%'; DROP TABLE invoices; --%");
  });

  it.each([
    [
      'Overdue',
      `("invoices"."status" in ($1, $2) and "invoices"."due_date" < $3)`,
      ['Draft', 'Pending', TODAY],
    ],
    [
      'Draft',
      `("invoices"."status" in ($1) and "invoices"."due_date" >= $2)`,
      ['Draft', TODAY],
    ],
    [
      'Pending',
      `("invoices"."status" in ($1) and "invoices"."due_date" >= $2)`,
      ['Pending', TODAY],
    ],
    ['Paid', `"invoices"."status" in ($1)`, ['Paid']],
  ] as const)(
    'translates status %s with the business date as a parameter',
    (status, text, params) => {
      expect(render(buildListWhere({ status, today: TODAY }, {}))).toEqual({
        text,
        params: [...params],
      });
    },
  );

  it('filters the invoice date range inclusively', () => {
    expect(
      render(
        buildListWhere(
          { fromDate: '2026-01-01', toDate: '2026-01-31', today: TODAY },
          {},
        ),
      ),
    ).toEqual({
      text: `("invoices"."invoice_date" >= $1 and "invoices"."invoice_date" <= $2)`,
      params: ['2026-01-01', '2026-01-31'],
    });
  });

  it('combines every condition with AND', () => {
    const where = render(
      buildListWhere(
        {
          keyword: 'acme',
          status: 'Paid',
          fromDate: '2026-01-01',
          today: TODAY,
        },
        {},
      ),
    );
    expect(where?.text).toContain(' and ');
    expect(where?.params).toHaveLength(4);
  });

  it('adds the ownership scope when one is given', () => {
    expect(render(buildScopeCondition({}))).toBeUndefined();
    expect(render(buildScopeCondition({ createdBy: 'u1' }))).toEqual({
      text: `"invoices"."created_by" = $1`,
      params: ['u1'],
    });
    expect(
      render(buildListWhere({ today: TODAY }, { createdBy: 'u1' }))?.params,
    ).toEqual(['u1']);
  });
});

describe('buildListOrderBy', () => {
  it.each([
    [
      'invoiceDate',
      'ASC',
      `"invoices"."invoice_date" asc`,
      `"invoices"."id" asc`,
    ],
    ['dueDate', 'DESC', `"invoices"."due_date" desc`, `"invoices"."id" desc`],
    [
      'totalAmount',
      'DESC',
      `"invoices"."total_amount" desc`,
      `"invoices"."id" desc`,
    ],
    [
      'totalAmount',
      'ASC',
      `"invoices"."total_amount" asc`,
      `"invoices"."id" asc`,
    ],
  ] as const)(
    'sorts by %s %s with the id tie-breaker in the same direction',
    (sortBy, ordering, first, second) => {
      const [column, tieBreaker] = buildListOrderBy(sortBy, ordering);
      expect(render(column)?.text).toBe(first);
      expect(render(tieBreaker)?.text).toBe(second);
    },
  );
});
