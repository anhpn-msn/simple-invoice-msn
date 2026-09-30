import type { InvoiceOrdering, InvoiceSortBy, InvoiceStatus } from './constants'

/** Query params of GET /invoices (SPEC 6.5). Every field is optional; empty values are not sent. */
export interface InvoiceListParams {
  page?: number
  pageSize?: number
  sortBy?: InvoiceSortBy
  ordering?: InvoiceOrdering
  status?: InvoiceStatus
  keyword?: string
  /** YYYY-MM-DD */
  fromDate?: string
  /** YYYY-MM-DD, >= fromDate */
  toDate?: string
}

/** One row of GET /invoices. Money fields are decimal strings, never numbers. */
export interface InvoiceSummary {
  invoiceId: string
  invoiceNumber: string
  customerName: string
  invoiceDate: string
  dueDate: string
  currency: string
  currencySymbol: string
  totalAmount: string
  balanceAmount: string
  status: InvoiceStatus
}

export interface Paging {
  page: number
  pageSize: number
  total: number
}

export interface PagedResponse<T> {
  data: T[]
  paging: Paging
}

export type InvoiceListResponse = PagedResponse<InvoiceSummary>

export interface InvoiceCustomer {
  fullname: string
  email: string
  mobileNumber: string | null
  address: string | null
}

export interface InvoiceItem {
  id: string
  name: string
  quantity: number
  rate: string
}

/** GET /invoices/:id and the 201 body of POST /invoices (SPEC 6.6). */
export interface InvoiceDetail {
  invoiceId: string
  invoiceNumber: string
  invoiceReference: string | null
  invoiceDate: string
  dueDate: string
  currency: string
  currencySymbol: string
  description: string | null
  status: InvoiceStatus
  customer: InvoiceCustomer
  items: InvoiceItem[]
  taxRate: string
  invoiceSubTotal: string
  totalTax: string
  totalDiscount: string
  totalAmount: string
  totalPaid: string
  balanceAmount: string
  /** ISO 8601 UTC */
  createdAt: string
  createdBy: string
}

export interface CreateInvoiceCustomer {
  fullname: string
  email: string
  mobileNumber?: string
  address?: string
}

export interface CreateInvoiceItem {
  name: string
  quantity: number
  rate: string
}

/** Body of POST /invoices (SPEC 6.7). Status, totals and currencySymbol are server-owned and never sent. */
export interface CreateInvoiceRequest {
  invoiceNumber: string
  invoiceReference?: string
  invoiceDate: string
  dueDate: string
  currency: string
  description?: string
  customer: CreateInvoiceCustomer
  items: [CreateInvoiceItem]
  taxRate?: string
  discount?: string
}
