import { z } from 'zod'
import {
  INVOICE_FIELD_LIMITS,
  INVOICE_ORDERINGS,
  INVOICE_SORT_FIELDS,
  INVOICE_STATUSES,
  type InvoiceListParams,
} from '@/entities/invoice'
import { isRealDate } from '@/shared/lib/date'
import { DEFAULT_PAGE_SIZE, MAX_PAGE, PAGE_SIZES } from './constants'
import type { InvoiceListFilters } from './types'

export const DEFAULT_FILTERS = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sortBy: 'invoiceDate',
  ordering: 'DESC',
} as const satisfies Pick<InvoiceListFilters, 'page' | 'pageSize' | 'sortBy' | 'ordering'>

const PAGE_DIGITS = new RegExp(`^\\d{1,${String(MAX_PAGE).length}}$`)

const dateParam = z.string().refine(isRealDate).optional().catch(undefined)

// Every field has its own fallback, so one bad value never discards the others.
const searchSchema = z.object({
  page: z
    .string()
    .regex(PAGE_DIGITS)
    .transform(Number)
    .pipe(z.number().min(1).max(MAX_PAGE))
    .catch(DEFAULT_FILTERS.page),
  pageSize: z
    .string()
    .transform(Number)
    .pipe(z.literal(PAGE_SIZES))
    .catch(DEFAULT_FILTERS.pageSize),
  sortBy: z.enum(INVOICE_SORT_FIELDS).catch(DEFAULT_FILTERS.sortBy),
  ordering: z
    .string()
    .transform((value) => value.toUpperCase())
    .pipe(z.enum(INVOICE_ORDERINGS))
    .catch(DEFAULT_FILTERS.ordering),
  status: z.enum(INVOICE_STATUSES).optional().catch(undefined),
  keyword: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(INVOICE_FIELD_LIMITS.keyword))
    .optional()
    .catch(undefined),
  fromDate: dateParam,
  toDate: dateParam,
})

/** Reads the URL into validated filters. Any invalid or missing value falls back to its default. */
export function parseListSearchParams(search: URLSearchParams): InvoiceListFilters {
  return searchSchema.parse({
    page: search.get('page') ?? undefined,
    pageSize: search.get('pageSize') ?? undefined,
    sortBy: search.get('sortBy') ?? undefined,
    ordering: search.get('ordering') ?? undefined,
    status: search.get('status') ?? undefined,
    keyword: search.get('keyword') ?? undefined,
    fromDate: search.get('fromDate') ?? undefined,
    toDate: search.get('toDate') ?? undefined,
  })
}

/** Writes filters back to the URL. Default values are left out to keep URLs short and shareable. */
export function toListSearchParams(filters: InvoiceListFilters): URLSearchParams {
  const search = new URLSearchParams()
  if (filters.page !== DEFAULT_FILTERS.page) search.set('page', String(filters.page))
  if (filters.pageSize !== DEFAULT_FILTERS.pageSize) search.set('pageSize', String(filters.pageSize))
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) search.set('sortBy', filters.sortBy)
  if (filters.ordering !== DEFAULT_FILTERS.ordering) search.set('ordering', filters.ordering)
  if (filters.status) search.set('status', filters.status)
  if (filters.keyword) search.set('keyword', filters.keyword)
  if (filters.fromDate) search.set('fromDate', filters.fromDate)
  if (filters.toDate) search.set('toDate', filters.toDate)
  return search
}

/** Query params for GET /invoices. Paging and sorting are always sent so the cache key is explicit. */
export function toApiParams(filters: InvoiceListFilters): InvoiceListParams {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy,
    ordering: filters.ordering,
    status: filters.status,
    keyword: filters.keyword,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  }
}

/** True when the date range would be rejected by the API (SPEC A-9). ISO dates compare correctly as strings. */
export function isDateRangeInvalid(filters: InvoiceListFilters): boolean {
  return Boolean(filters.fromDate && filters.toDate && filters.fromDate > filters.toDate)
}

/** True when anything differs from the default view, including sorting and page size. */
export function hasNonDefaultState(filters: InvoiceListFilters): boolean {
  return toListSearchParams({ ...filters, page: 1 }).size > 0
}

/** True when a filter narrows the result set (sorting and paging do not). */
export function hasActiveFilters(filters: InvoiceListFilters): boolean {
  return Boolean(filters.status || filters.keyword || filters.fromDate || filters.toDate)
}
