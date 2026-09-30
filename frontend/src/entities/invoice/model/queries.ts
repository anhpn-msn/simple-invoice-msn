import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { fetchInvoice, fetchInvoices } from '../api/invoices'
import type { InvoiceListParams } from './types'

export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (params: InvoiceListParams) => [...invoiceKeys.lists(), params] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
}

export function invoiceListQueryOptions(params: InvoiceListParams) {
  return queryOptions({
    queryKey: invoiceKeys.list(params),
    queryFn: ({ signal }) => fetchInvoices(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function invoiceDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: invoiceKeys.detail(id),
    queryFn: ({ signal }) => fetchInvoice(id, signal),
  })
}
