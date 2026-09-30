import type { InvoiceOrdering, InvoiceSortBy, InvoiceStatus } from '@/entities/invoice'
import type { PageSize } from './constants'

export interface InvoiceListFilters {
  page: number
  pageSize: PageSize
  sortBy: InvoiceSortBy
  ordering: InvoiceOrdering
  status?: InvoiceStatus
  keyword?: string
  /** YYYY-MM-DD */
  fromDate?: string
  /** YYYY-MM-DD */
  toDate?: string
}

export interface UpdateListOptions {
  replace?: boolean
}
