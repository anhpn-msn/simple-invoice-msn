import { invoiceItems, invoices } from '../database/schema';

/** Explicit column lists: a column added later is never exposed by accident. */
export const LIST_COLUMNS = {
  id: invoices.id,
  invoiceNumber: invoices.invoiceNumber,
  customerFullname: invoices.customerFullname,
  invoiceDate: invoices.invoiceDate,
  dueDate: invoices.dueDate,
  currency: invoices.currency,
  currencySymbol: invoices.currencySymbol,
  totalAmount: invoices.totalAmount,
  balanceAmount: invoices.balanceAmount,
  status: invoices.status,
} as const;

export const DETAIL_COLUMNS = {
  id: invoices.id,
  invoiceNumber: invoices.invoiceNumber,
  invoiceReference: invoices.invoiceReference,
  invoiceDate: invoices.invoiceDate,
  dueDate: invoices.dueDate,
  currency: invoices.currency,
  currencySymbol: invoices.currencySymbol,
  description: invoices.description,
  status: invoices.status,
  customerFullname: invoices.customerFullname,
  customerEmail: invoices.customerEmail,
  customerMobile: invoices.customerMobile,
  customerAddress: invoices.customerAddress,
  taxRate: invoices.taxRate,
  invoiceSubTotal: invoices.invoiceSubTotal,
  totalTax: invoices.totalTax,
  totalDiscount: invoices.totalDiscount,
  totalAmount: invoices.totalAmount,
  totalPaid: invoices.totalPaid,
  balanceAmount: invoices.balanceAmount,
  createdAt: invoices.createdAt,
  createdBy: invoices.createdBy,
} as const;

export const ITEM_COLUMNS = {
  id: invoiceItems.id,
  name: invoiceItems.name,
  quantity: invoiceItems.quantity,
  rate: invoiceItems.rate,
} as const;
