import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type {
  Database,
  DbExecutor,
  Transaction,
} from '../database/database.types';
import { invoiceItems, invoices } from '../database/schema';
import {
  buildListOrderBy,
  buildListWhere,
  buildScopeCondition,
} from './invoice-list-query';
import type {
  InvoiceListCriteria,
  InvoicePage,
  InvoiceScope,
  InvoiceWithItems,
  NewInvoiceRow,
  NewInvoiceItemRow,
} from './invoices.types';
import { LIST_COLUMNS, DETAIL_COLUMNS, ITEM_COLUMNS } from './invoices.columns';

@Injectable()
export class InvoicesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * One page plus the total for the same filter. The two queries run in
   * parallel on separate pool connections; a plain count(*) also stays correct
   * when the requested page is past the end (a window count would return no row).
   */
  async list(
    criteria: InvoiceListCriteria,
    scope: InvoiceScope,
  ): Promise<InvoicePage> {
    const where = buildListWhere(criteria, scope);
    const [rows, totals] = await Promise.all([
      this.db
        .select(LIST_COLUMNS)
        .from(invoices)
        .where(where)
        .orderBy(...buildListOrderBy(criteria.sortBy, criteria.ordering))
        .limit(criteria.pageSize)
        .offset((criteria.page - 1) * criteria.pageSize),
      this.db.select({ total: count() }).from(invoices).where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  }

  async findById(
    id: string,
    scope: InvoiceScope,
    executor: DbExecutor = this.db,
  ): Promise<InvoiceWithItems | undefined> {
    const [invoice] = await executor
      .select(DETAIL_COLUMNS)
      .from(invoices)
      .where(and(eq(invoices.id, id), buildScopeCondition(scope)));
    if (!invoice) return undefined;
    const items = await executor
      .select(ITEM_COLUMNS)
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(asc(invoiceItems.position));
    return { invoice, items };
  }

  /** Inserts the invoice and its single item; must run in the caller's transaction. */
  async insertWithItem(
    tx: Transaction,
    invoice: NewInvoiceRow,
    item: NewInvoiceItemRow,
  ): Promise<InvoiceWithItems> {
    const [insertedInvoice] = await tx
      .insert(invoices)
      .values(invoice)
      .returning(DETAIL_COLUMNS);
    const insertedItems = await tx
      .insert(invoiceItems)
      .values(item)
      .returning(ITEM_COLUMNS);
    return { invoice: insertedInvoice, items: insertedItems };
  }
}
