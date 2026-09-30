import { http, HttpResponse, type RequestHandler } from 'msw'
import type { CreateInvoiceRequest, InvoiceDetail, InvoiceListParams } from '@/entities/invoice'
import {
  accountantUser,
  invoiceDetailFixtures,
  makeLoginResponse,
  TEST_PASSWORD,
  toInvoiceSummary,
} from './fixtures'
import type { ApiHandlerOptions } from './types'

export function errorBody(statusCode: number, message: string | string[], error: string) {
  return { statusCode, message, error }
}

const UNAUTHORIZED = () => HttpResponse.json(errorBody(401, 'Unauthorized', 'Unauthorized'), { status: 401 })

function hasBearer(request: Request): boolean {
  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') && header.length > 'Bearer '.length
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function scaled(value: string, decimals: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole + fraction.padEnd(decimals, '0').slice(0, decimals))
}

function divRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n)
}

function toMoneyString(minor: bigint, decimals: number): string {
  const digits = minor.toString().padStart(decimals + 1, '0')
  return decimals === 0 ? digits : `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`
}

const SYMBOLS: Record<string, string> = { AUD: 'AU$', USD: 'US$', GBP: '£', EUR: '€', SGD: 'S$', JPY: '¥', VND: '₫' }

/** Test-side mirror of the backend calculation (SPEC 4.3) using integer math on decimal strings. */
function buildCreatedInvoice(body: CreateInvoiceRequest, id: string, createdBy: string): InvoiceDetail {
  const decimals = body.currency === 'JPY' || body.currency === 'VND' ? 0 : 2
  const item = body.items[0]
  const subMinor = divRound(BigInt(item.quantity) * scaled(item.rate, 4), 10n ** BigInt(4 - decimals))
  const taxRate = body.taxRate ?? '10'
  const taxMinor = divRound(subMinor * scaled(taxRate, 2), 10000n)
  const discountMinor = scaled(body.discount ?? '0', decimals)
  const totalMinor = subMinor + taxMinor - discountMinor
  return {
    invoiceId: id,
    invoiceNumber: body.invoiceNumber,
    invoiceReference: body.invoiceReference ?? null,
    invoiceDate: body.invoiceDate,
    dueDate: body.dueDate,
    currency: body.currency,
    currencySymbol: SYMBOLS[body.currency] ?? body.currency,
    description: body.description ?? null,
    status: 'Draft',
    customer: {
      fullname: body.customer.fullname,
      email: body.customer.email.toLowerCase(),
      mobileNumber: body.customer.mobileNumber ?? null,
      address: body.customer.address ?? null,
    },
    items: [{ id: `${id.slice(0, -4)}0001`, name: item.name, quantity: item.quantity, rate: item.rate }],
    taxRate: toMoneyString(scaled(taxRate, 2), 2),
    invoiceSubTotal: toMoneyString(subMinor, decimals),
    totalTax: toMoneyString(taxMinor, decimals),
    totalDiscount: toMoneyString(discountMinor, decimals),
    totalAmount: toMoneyString(totalMinor, decimals),
    totalPaid: toMoneyString(0n, decimals),
    balanceAmount: toMoneyString(totalMinor, decimals),
    createdAt: '2026-09-30T00:00:00.000Z',
    createdBy,
  }
}

function parseListParams(url: URL): { params: InvoiceListParams; errors: string[] } {
  const q = url.searchParams
  const errors: string[] = []
  const page = q.has('page') ? Number(q.get('page')) : 1
  const pageSize = q.has('pageSize') ? Number(q.get('pageSize')) : 10
  if (!Number.isInteger(page) || page < 1) errors.push('page must not be less than 1')
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) errors.push('pageSize must be between 1 and 100')
  return {
    errors,
    params: {
      page,
      pageSize,
      sortBy: (q.get('sortBy') as InvoiceListParams['sortBy']) ?? 'invoiceDate',
      ordering: (q.get('ordering')?.toUpperCase() as InvoiceListParams['ordering']) ?? 'DESC',
      status: (q.get('status') as InvoiceListParams['status']) ?? undefined,
      keyword: q.get('keyword')?.trim() || undefined,
      fromDate: q.get('fromDate') ?? undefined,
      toDate: q.get('toDate') ?? undefined,
    },
  }
}

/**
 * MSW handlers for the whole API contract (SPEC 6). Paths are relative so they match
 * the SPA's same-origin `/api` calls. Each call returns fresh state, so tests never leak.
 */
export function createApiHandlers(options: ApiHandlerOptions = {}): RequestHandler[] {
  const user = options.user ?? accountantUser
  const invoices = [...(options.invoices ?? invoiceDetailFixtures)]
  const idempotency = new Map<string, InvoiceDetail>()
  let refreshCookie = options.refreshCookie ?? false
  let createdCount = 0

  return [
    http.post('/api/auth/login', async ({ request }) => {
      const body = (await request.json()) as { email?: string; password?: string }
      if (body.email?.trim().toLowerCase() !== user.email || body.password !== TEST_PASSWORD) {
        return HttpResponse.json(errorBody(401, 'Invalid email or password', 'Unauthorized'), { status: 401 })
      }
      refreshCookie = true
      return HttpResponse.json(makeLoginResponse(user))
    }),

    http.post('/api/auth/refresh', ({ request }) => {
      if (request.headers.get('x-requested-with') !== 'SimpleInvoice') {
        return HttpResponse.json(errorBody(403, 'Forbidden', 'Forbidden'), { status: 403 })
      }
      if (!refreshCookie) {
        return HttpResponse.json(errorBody(401, 'Unauthorized', 'Unauthorized'), { status: 401 })
      }
      return HttpResponse.json(makeLoginResponse(user))
    }),

    http.post('/api/auth/logout', () => {
      refreshCookie = false
      return new HttpResponse(null, { status: 204 })
    }),

    http.get('/api/auth/me', ({ request }) => (hasBearer(request) ? HttpResponse.json(user) : UNAUTHORIZED())),

    http.get('/api/invoices', ({ request }) => {
      if (!hasBearer(request)) return UNAUTHORIZED()
      const { params, errors } = parseListParams(new URL(request.url))
      if (errors.length > 0) {
        return HttpResponse.json(errorBody(400, errors, 'Bad Request'), { status: 400 })
      }
      const keyword = params.keyword?.toLowerCase()
      const rows = invoices
        .map(toInvoiceSummary)
        .filter((row) => !params.status || row.status === params.status)
        .filter((row) => !params.fromDate || row.invoiceDate >= params.fromDate)
        .filter((row) => !params.toDate || row.invoiceDate <= params.toDate)
        .filter(
          (row) =>
            !keyword ||
            row.invoiceNumber.toLowerCase().includes(keyword) ||
            row.customerName.toLowerCase().includes(keyword),
        )
      const direction = params.ordering === 'ASC' ? 1 : -1
      rows.sort((a, b) => {
        const key = params.sortBy ?? 'invoiceDate'
        const left = key === 'totalAmount' ? scaled(a.totalAmount, 4) : a[key]
        const right = key === 'totalAmount' ? scaled(b.totalAmount, 4) : b[key]
        if (left === right) return a.invoiceId.localeCompare(b.invoiceId)
        return (left < right ? -1 : 1) * direction
      })
      const page = params.page ?? 1
      const pageSize = params.pageSize ?? 10
      return HttpResponse.json({
        data: rows.slice((page - 1) * pageSize, page * pageSize),
        paging: { page, pageSize, total: rows.length },
      })
    }),

    http.get('/api/invoices/:id', ({ request, params }) => {
      if (!hasBearer(request)) return UNAUTHORIZED()
      const id = String(params.id)
      if (!UUID.test(id)) {
        return HttpResponse.json(errorBody(400, 'Validation failed (uuid is expected)', 'Bad Request'), { status: 400 })
      }
      const found = invoices.find((invoice) => invoice.invoiceId === id)
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json(errorBody(404, 'Invoice not found', 'Not Found'), { status: 404 })
    }),

    http.post('/api/invoices', async ({ request }) => {
      if (!hasBearer(request)) return UNAUTHORIZED()
      if (!user.permissions.includes('invoice:create')) {
        return HttpResponse.json(errorBody(403, 'Forbidden resource', 'Forbidden'), { status: 403 })
      }
      const key = request.headers.get('idempotency-key')
      const replay = key ? idempotency.get(key) : undefined
      if (replay) {
        return HttpResponse.json(replay, {
          status: 201,
          headers: { Location: `/invoices/${replay.invoiceId}`, 'Idempotent-Replayed': 'true' },
        })
      }
      const body = (await request.json()) as CreateInvoiceRequest
      if (invoices.some((invoice) => invoice.invoiceNumber.toLowerCase() === body.invoiceNumber.toLowerCase())) {
        return HttpResponse.json(errorBody(409, 'Invoice number already exists', 'Conflict'), { status: 409 })
      }
      createdCount += 1
      const id = `0190d000-0000-7000-8000-${String(createdCount).padStart(12, '0')}`
      const created = buildCreatedInvoice(body, id, user.id)
      invoices.unshift(created)
      if (key) idempotency.set(key, created)
      return HttpResponse.json(created, { status: 201, headers: { Location: `/invoices/${id}` } })
    }),
  ]
}
