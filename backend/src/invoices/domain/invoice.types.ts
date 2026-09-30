import type { PersistedInvoiceStatus } from './invoice-status';
import type Decimal from 'decimal.js';

export interface CurrencyInfo {
  readonly code: string;
  readonly symbol: string;
  /** ISO 4217 minor units (number of decimals of the smallest circulating unit). */
  readonly minorUnits: number;
}

export interface ParseDecimalOptions {
  /** Maximum number of fraction digits allowed for this field. */
  maxDecimals: number;
  /** Whether a value equal to zero is accepted. */
  allowZero: boolean;
  /** Field name used in the error message. */
  field?: string;
}

/** Money inputs arrive as strings from the API or as Decimals from storage. */
export type DecimalInput = string | Decimal;

export interface InvoiceCalculationInput {
  quantity: number;
  rate: DecimalInput;
  /** Percent, 0 to 100 with at most 2 decimals. Defaults to "10". */
  taxRate?: DecimalInput;
  /** Absolute amount in the invoice currency. Defaults to "0". */
  discount?: DecimalInput;
  currency: string;
  /** Defaults to "0" (new invoices). */
  totalPaid?: DecimalInput;
}

export interface InvoiceTotals {
  subTotal: Decimal;
  taxAmount: Decimal;
  discount: Decimal;
  totalAmount: Decimal;
  totalPaid: Decimal;
  balanceAmount: Decimal;
}

/**
 * ORM-agnostic description of the SQL predicate for a status filter (SPEC 4.4).
 * `persistedIn` is `status IN (...)`; `dueDate` is `due_date < value` or `>= value`.
 */
export interface StatusFilterCriteria {
  persistedIn: PersistedInvoiceStatus[];
  dueDate?: { op: 'lt' | 'gte'; value: string };
}
