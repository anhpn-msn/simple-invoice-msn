import { and, asc, desc, gte, inArray, lt, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { invoices } from '../database/schema';
import { statusFilterCriteria } from './domain';
import type { Ordering, SortField } from './dto/list-invoices-query.dto';
import type { InvoiceScope, InvoiceListCriteria } from './invoices.types';

/** Sort whitelist: user input only ever selects a key, never becomes SQL. */
const SORT_COLUMNS = {
  invoiceDate: invoices.invoiceDate,
  dueDate: invoices.dueDate,
  totalAmount: invoices.totalAmount,
} as const;

/** Escapes LIKE metacharacters so the keyword matches literally. Backslash first. */
export function escapeLike(keyword: string): string {
  return keyword.replaceAll(/[\\%_]/g, (character) => `\\${character}`);
}

/** Ownership restriction; undefined while every reader sees every invoice (A-12). */
export function buildScopeCondition(scope: InvoiceScope): SQL | undefined {
  return scope.createdBy === undefined
    ? undefined
    : sql`${invoices.createdBy} = ${scope.createdBy}`;
}

/** WHERE clause shared by the page query and the count query. */
export function buildListWhere(
  criteria: Pick<
    InvoiceListCriteria,
    'keyword' | 'status' | 'fromDate' | 'toDate' | 'today'
  >,
  scope: InvoiceScope,
): SQL | undefined {
  const conditions: (SQL | undefined)[] = [buildScopeCondition(scope)];

  if (criteria.keyword !== undefined) {
    const pattern = `%${escapeLike(criteria.keyword)}%`;
    conditions.push(
      or(
        sql`${invoices.invoiceNumber} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${invoices.customerFullname} ILIKE ${pattern} ESCAPE '\\'`,
      ),
    );
  }

  if (criteria.status !== undefined) {
    const { persistedIn, dueDate } = statusFilterCriteria(
      criteria.status,
      criteria.today,
    );
    conditions.push(inArray(invoices.status, persistedIn));
    if (dueDate) {
      conditions.push(
        dueDate.op === 'lt'
          ? lt(invoices.dueDate, dueDate.value)
          : gte(invoices.dueDate, dueDate.value),
      );
    }
  }

  if (criteria.fromDate !== undefined) {
    conditions.push(gte(invoices.invoiceDate, criteria.fromDate));
  }
  if (criteria.toDate !== undefined) {
    conditions.push(lte(invoices.invoiceDate, criteria.toDate));
  }

  return and(...conditions);
}

/**
 * ORDER BY the chosen column, then `id` in the same direction. Without the
 * unique tie-breaker, offset pages can repeat or skip rows with equal keys.
 * Matches the (column, id) indexes.
 */
export function buildListOrderBy(
  sortBy: SortField,
  ordering: Ordering,
): [SQL, SQL] {
  const direction = ordering === 'ASC' ? asc : desc;
  return [direction(SORT_COLUMNS[sortBy]), direction(invoices.id)];
}
