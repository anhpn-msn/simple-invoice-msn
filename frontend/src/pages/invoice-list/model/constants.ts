import type { InvoiceSortBy } from '@/entities/invoice'

export const PAGE_SIZES = [10, 20, 50] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export const DEFAULT_PAGE_SIZE: PageSize = 10

/** Highest page number accepted from the URL. Larger values are treated as garbage and reset to page 1. */
export const MAX_PAGE = 100000

export const KEYWORD_DEBOUNCE_MS = 300

/** Tailwind's `md` breakpoint: table from here up, cards below. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

export const SORT_LABELS: Record<InvoiceSortBy, string> = {
  invoiceDate: 'Invoice date',
  dueDate: 'Due date',
  totalAmount: 'Total amount',
}
