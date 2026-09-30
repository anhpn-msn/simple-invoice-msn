import { api } from '@/shared/api'
import { API_PATHS, HEADER_IDEMPOTENCY_KEY } from '@/shared/config'
import type {
  CreateInvoiceRequest,
  InvoiceDetail,
  InvoiceListParams,
  InvoiceListResponse,
} from '../model/types'

export function fetchInvoices(params: InvoiceListParams, signal?: AbortSignal): Promise<InvoiceListResponse> {
  return api.get<InvoiceListResponse>(API_PATHS.invoices, { query: { ...params }, signal })
}

export function fetchInvoice(id: string, signal?: AbortSignal): Promise<InvoiceDetail> {
  return api.get<InvoiceDetail>(API_PATHS.invoice(id), { signal })
}

/** `idempotencyKey` must be generated once per form mount so a retry replays instead of duplicating. */
export function createInvoice(body: CreateInvoiceRequest, idempotencyKey: string): Promise<InvoiceDetail> {
  return api.post<InvoiceDetail>(API_PATHS.invoices, body, {
    headers: { [HEADER_IDEMPOTENCY_KEY]: idempotencyKey },
  })
}
