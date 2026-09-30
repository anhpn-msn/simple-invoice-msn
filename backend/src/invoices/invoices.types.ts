import type { AuditRequestContext } from '../audit';
import type { invoiceItems, invoices } from '../database/schema';
import type { StoredResponse } from '../idempotency';
import type { InvoiceStatus } from './domain';
import type { InvoiceDetailDto } from './dto/invoice-response.dto';
import type { Ordering, SortField } from './dto/list-invoices-query.dto';
import type {
  DETAIL_COLUMNS,
  ITEM_COLUMNS,
  LIST_COLUMNS,
} from './invoices.columns';

/**
 * Who may see which invoices (SPEC A-12). Single-tenant today, so an empty
 * scope means "all"; ownership scoping is added here without touching controllers.
 */
export interface InvoiceScope {
  createdBy?: string;
}

export interface InvoiceListCriteria {
  keyword?: string;
  status?: InvoiceStatus;
  fromDate?: string;
  toDate?: string;
  sortBy: SortField;
  ordering: Ordering;
  page: number;
  pageSize: number;
  /** Business date from the BusinessCalendar, bound as a parameter. */
  today: string;
}

export type InvoiceListRow = Pick<
  typeof invoices.$inferSelect,
  keyof typeof LIST_COLUMNS
>;
export type InvoiceDetailRow = Pick<
  typeof invoices.$inferSelect,
  keyof typeof DETAIL_COLUMNS
>;
export type InvoiceItemRow = Pick<
  typeof invoiceItems.$inferSelect,
  keyof typeof ITEM_COLUMNS
>;

export type NewInvoiceRow = typeof invoices.$inferInsert;
export type NewInvoiceItemRow = typeof invoiceItems.$inferInsert;

export interface InvoicePage {
  rows: InvoiceListRow[];
  total: number;
}

export interface InvoiceWithItems {
  invoice: InvoiceDetailRow;
  items: InvoiceItemRow[];
}

export interface CreateInvoiceOptions {
  /** Already validated by IdempotencyKeyPipe. Absent means no idempotency. */
  idempotencyKey?: string;
  context?: AuditRequestContext;
}

export interface CreateInvoiceResult extends StoredResponse {
  body: InvoiceDetailDto;
  replayed: boolean;
}

export interface DecimalStringOptions {
  maxDecimals: number;
  allowZero: boolean;
  /** Inclusive upper bound as a decimal string. */
  max?: string;
}
