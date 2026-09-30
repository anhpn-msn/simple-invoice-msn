import {
  Dec,
  PERSISTED_STATUSES,
  deriveEffectiveStatus,
  formatAmount,
  formatPercent,
  formatRate,
} from './domain';
import type { PersistedInvoiceStatus } from './domain';
import type {
  InvoiceDetailDto,
  InvoiceListItemDto,
} from './dto/invoice-response.dto';
import type {
  InvoiceDetailRow,
  InvoiceItemRow,
  InvoiceListRow,
} from './invoices.types';

/** The DB CHECK guarantees this; the guard keeps the type honest and fails loudly on drift. */
function persistedStatus(value: string): PersistedInvoiceStatus {
  if ((PERSISTED_STATUSES as readonly string[]).includes(value)) {
    return value as PersistedInvoiceStatus;
  }
  throw new Error(`Unexpected persisted invoice status: ${value}`);
}

const amount = (value: string, currency: string): string =>
  formatAmount(new Dec(value), currency);

/** Maps a list row to its response DTO; `today` must come from the BusinessCalendar. */
export function toListItem(
  row: InvoiceListRow,
  today: string,
): InvoiceListItemDto {
  return {
    invoiceId: row.id,
    invoiceNumber: row.invoiceNumber,
    customerName: row.customerFullname,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    currency: row.currency,
    currencySymbol: row.currencySymbol,
    totalAmount: amount(row.totalAmount, row.currency),
    balanceAmount: amount(row.balanceAmount, row.currency),
    status: deriveEffectiveStatus(
      persistedStatus(row.status),
      row.dueDate,
      today,
    ),
  };
}

/** Maps an invoice row plus its items to the detail response; never returns ORM rows. */
export function toDetail(
  row: InvoiceDetailRow,
  items: readonly InvoiceItemRow[],
  today: string,
): InvoiceDetailDto {
  return {
    invoiceId: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceReference: row.invoiceReference,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    currency: row.currency,
    currencySymbol: row.currencySymbol,
    description: row.description,
    status: deriveEffectiveStatus(
      persistedStatus(row.status),
      row.dueDate,
      today,
    ),
    customer: {
      fullname: row.customerFullname,
      email: row.customerEmail,
      mobileNumber: row.customerMobile,
      address: row.customerAddress,
    },
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      rate: formatRate(new Dec(item.rate), row.currency),
    })),
    taxRate: formatPercent(new Dec(row.taxRate)),
    invoiceSubTotal: amount(row.invoiceSubTotal, row.currency),
    totalTax: amount(row.totalTax, row.currency),
    totalDiscount: amount(row.totalDiscount, row.currency),
    totalAmount: amount(row.totalAmount, row.currency),
    totalPaid: amount(row.totalPaid, row.currency),
    balanceAmount: amount(row.balanceAmount, row.currency),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}
