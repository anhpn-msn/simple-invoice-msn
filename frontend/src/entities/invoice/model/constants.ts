import { MAX_EMAIL_LENGTH } from '@/shared/config'

export const INVOICE_STATUSES = ['Draft', 'Pending', 'Paid', 'Overdue'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const INVOICE_SORT_FIELDS = ['invoiceDate', 'dueDate', 'totalAmount'] as const
export type InvoiceSortBy = (typeof INVOICE_SORT_FIELDS)[number]

export const INVOICE_ORDERINGS = ['ASC', 'DESC'] as const
export type InvoiceOrdering = (typeof INVOICE_ORDERINGS)[number]

/** Applied by the server when a create request leaves `taxRate` out (SPEC 4.5). */
export const DEFAULT_TAX_RATE = '10'

/** Input limits of the invoice API (SPEC 4.5). Text limits are character counts. */
export const INVOICE_FIELD_LIMITS = {
  customerFullname: 200,
  customerEmail: MAX_EMAIL_LENGTH,
  customerMobileNumber: { min: 6, max: 32 },
  customerAddress: 500,
  invoiceNumber: 50,
  invoiceReference: 100,
  description: 1000,
  itemName: 200,
  itemQuantity: { min: 1, max: 100000 },
  itemRate: { max: '999999999.9999', maxDecimals: 4 },
  taxRate: { max: 100, maxDecimals: 2 },
  keyword: 100,
} as const
